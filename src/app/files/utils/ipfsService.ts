import axios from "axios";
import CryptoJS from "crypto-js";
import { encryptText, decryptText } from "./encryption";

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL;
const PINATA_JWT = process.env.PINATA_JWT;

// 生成随机 Access Key
export function generateAccessKey(): string {
  return CryptoJS.lib.WordArray.random(16).toString();
}

// 计算 Access Key 的 Hash（用于索引）
export function getAccessHash(accessKey: string): string {
  return CryptoJS.SHA256(accessKey).toString();
}

// **获取 `index.json` 的最新 CID**
async function fetchLatestIndexCID(accessKey: string): Promise<string | null> {
  try {
    const indexFileName = `index_${getAccessHash(accessKey)}.json`;
    console.log("Fetching latest index.json CID...");

    const response = await axios.get("https://api.pinata.cloud/data/pinList", {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      params: { "metadata[name]": indexFileName },
    });

    console.log("PinList Response:", response.data);

    if (!response.data?.rows || response.data.rows.length === 0) {
      console.warn("No ${indexFileName} found.");
      return null;
    }

    // **获取最新的 `index.json`**
    type PinListRow = { ipfs_pin_hash: string; date_pinned: string };
    const latestIndex = response.data.rows.reduce((prev: PinListRow, current: PinListRow) =>
      new Date(prev.date_pinned) > new Date(current.date_pinned) ? prev : current
    );

    console.log("Latest ${indexFileName} CID:", latestIndex.ipfs_pin_hash);
    return latestIndex.ipfs_pin_hash;
  } catch (error: any) {
    console.error("Error fetching latest index CID:", JSON.stringify(error, null, 2));
    return null;
  }
}

// **获取文件列表**
export async function getFileList(accessKey: string): Promise<{ fileName: string; cid: string }[]> {
  try {
    console.log("Fetching index.json...");
    const indexCid = await fetchLatestIndexCID(accessKey);
    if (!indexCid) {
      console.log("No index.json found. Returning empty list.");
      return [];
    }

    // **请求 index.json**
    const response = await axios.get(`${PINATA_GATEWAY}/ipfs/${indexCid}`);
    console.log("Encrypted index.json data:", response.data);

    if (!response.data || response.data.length === 0) {
      console.log("index.json is empty.");
      return [];
    }

    // **解密 index.json**
    const decryptedData = decryptText(response.data, accessKey);
    console.log("Decrypted index.json data:", decryptedData);

    if (!decryptedData || decryptedData.trim() === "") {
      console.log("Decrypted index.json is empty.");
      return [];
    }

    try {
      type FileListItem = { fileName: string; cid: string };
      const fileList: FileListItem[] = JSON.parse(decryptedData);
      console.log("Parsed file list:", fileList);
      return fileList;
    } catch (e) {
      console.error("Failed to parse index.json:", e, "Raw decrypted data:", decryptedData);
      return [];
    }
  } catch (error) {
    console.error("Failed to load index.json:", error);
    return [];
  }
}

// **上传文件并 Unpin 旧文件**
export async function uploadFile(
  fileName: string,
  content: string,
  accessKey: string,
  shouldEncrypt: boolean = true // 默认加密，index.json 传 false
): Promise<string | null> {
  try {
    const fileList = await getFileList(accessKey);
    const existingFile = fileList.find(file => file.fileName === fileName);
    const oldCid = existingFile?.cid || null;

    // **如果是 `index.json`，改名为 `index_<accessHash>.json`**
    const isIndexFile = fileName === "index.json";
    const finalFileName = isIndexFile ? `index_${getAccessHash(accessKey)}.json` : fileName;

    // **仅在 shouldEncrypt 为 true 时加密**
    const finalContent = shouldEncrypt ? encryptText(content, accessKey) : content;

    const formData = new FormData();
    formData.append("file", new Blob([finalContent], { type: "application/json" }));

    // **确保 index.json 存储正确的 accessHash**
    const metadata: { name: string; keyvalues?: Record<string, string> } = { name: finalFileName };
    if (isIndexFile) {
      metadata.keyvalues = { accessHash: getAccessHash(accessKey) };
    }
    formData.append("pinataMetadata", JSON.stringify(metadata));

    // **上传文件**
    const response = await axios.post("https://api.pinata.cloud/pinning/pinFileToIPFS", formData, {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
    });

    if (!response.data || !response.data.IpfsHash) {
      console.error("Error: No IpfsHash in response:", response.data);
      return null;
    }

    const newCid = response.data.IpfsHash;
    console.log(`File uploaded successfully: ${fileName}, CID: ${newCid}`);

    // **上传成功后再 `unpin` 旧文件**
    if (oldCid) {
      console.log(`Unpinning old file: ${oldCid}`);
      await unpinFile(oldCid);
    }

    return newCid;
  } catch (error) {
    console.error("Error uploading file:", error);
    return null;
  }
}

// **更新 `index.json` 并 Unpin 旧版本**
export async function updateIndex(accessKey: string, fileName: string, fileCid: string): Promise<boolean> {
  try {
    const indexFileName = `index_${getAccessHash(accessKey)}.json`;
    let indexData = await getFileList(accessKey);
    if (!indexData || indexData.length === 0) {
      indexData = [];
    }

    console.log(`Before update, ${indexFileName} data:`, indexData);

    // **删除目标文件**
    indexData = indexData.filter(file => file.fileName.trim() !== fileName.trim());

    // **添加新文件**
    if (fileCid) {
      indexData.push({ fileName, cid: fileCid });
    }

    console.log("After update, new index.json data:", indexData);

    // **加密 index.json**
    const encryptedIndex = encryptText(JSON.stringify(indexData), accessKey);

    // **获取旧的 index.json CID**
    const oldIndexCid = await fetchLatestIndexCID(accessKey);
    console.log(`Previous ${indexFileName} CID:`, oldIndexCid);

    // **上传新的 index.json**
    const newIndexCid = await uploadFile(indexFileName, encryptedIndex, accessKey, false);
    if (!newIndexCid) {
      console.warn(`Warning: new ${indexFileName} uploaded, but CID not received. Check Pinata.`);
      return false;
    }
    console.log(`Successfully uploaded new ${indexFileName}, CID:`, newIndexCid);

    // **Unpin 旧的 index.json**
    if (oldIndexCid && oldIndexCid !== newIndexCid) {
      console.log(`Unpinning old ${indexFileName}: ${oldIndexCid}`);
      await unpinFile(oldIndexCid);
    }

    return true;
  } catch (error) {
    console.error("Error updating index:", error);
    return false;
  }
}

// **Unpin 文件**
export async function unpinFile(cid: string): Promise<boolean> {
  try {
    console.log(`Attempting to unpin file: ${cid}`);

    // 先检查文件是否真的还在 Pinata 中
    const response = await axios.get("https://api.pinata.cloud/data/pinList", {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      params: { "hashContains": cid },
    });

    if (!response.data || response.data.count === 0) {
      console.warn(`File ${cid} is already unpinned or does not exist.`);
      return true; // 认为成功，不重复 unpin
    }

    // 发送 unpin 请求
    const unpinResponse = await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, {
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
    });

    if (unpinResponse.status === 200) {
      console.log(`Successfully unpinned file: ${cid}`);
      return true;
    } else {
      console.error(`Failed to unpin file: ${cid}`, unpinResponse.data);
      return false;
    }
  } catch (error: any) {
    console.error("Error unpinning file:", error.response?.data || error.message);
    return false;
  }
}

// **删除文件并更新 `index.json`**
export async function deleteFile(cid: string, fileName: string, accessKey: string): Promise<boolean> {
  try {
    console.log(`Deleting file CID: ${cid}...`);

    if (!cid || !fileName || !accessKey) {
      console.error("Missing required parameters.");
      return false;
    }

    // **1. 先调用 `/api/ipfs/delete` 删除文件**
    const deleteResponse = await axios.delete("/api/ipfs/delete", {
      data: { cid },
    });

    if (deleteResponse.status !== 200 || !deleteResponse.data.success) {
      console.error("Failed to delete file via API:", deleteResponse.data);
      return false;
    }

    console.log("File deleted via API:", cid);

    // **2. 更新 index.json**
    const indexUpdated = await updateIndex(accessKey, fileName, "");
    if (!indexUpdated) {
      console.error("Failed to update index.json after deleting file.");
      return false;
    }

    console.log(`File CID ${cid} deleted successfully and index updated.`);
    return true;
  } catch (error) {
    console.error("Error deleting file:", error);
    return false;
  }
}

// **获取文件并解密**
export async function getFileFromPinata(cid: string, accessKey: string): Promise<string | null> {
  try {
    const response = await axios.get(`${PINATA_GATEWAY}/ipfs/${cid}`);
    if (!response.data) return null;

    return decryptText(response.data, accessKey);
  } catch (error) {
    console.error("Error fetching file:", error);
    return null;
  }
}
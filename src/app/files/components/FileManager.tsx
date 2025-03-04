"use client";

import { useState, useEffect } from "react";
import {
  getFileList,
  uploadFile,
  deleteFile,
  getFileFromPinata,
  updateIndex
} from "../utils/ipfsService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function FileManager({ accessKey }: { accessKey: string }) {
  const [fileList, setFileList] = useState<{ fileName: string; cid: string }[]>([]);
  const [selectedFile, setSelectedFile] = useState<{ fileName: string; cid: string } | null>(null);
  const [fileContent, setFileContent] = useState<string>("");

  // Load file list
  useEffect(() => {
    async function fetchFiles() {
      try {
        console.log("Fetching files with accessKey:", accessKey);
        const files = await getFileList(accessKey);
        console.log("Received file list:", files);
        setFileList(files.length > 0 ? files : []);
      } catch (error) {
        console.error("Error fetching files:", error);
        setFileList([]);
      }
    }
    fetchFiles();
  }, [accessKey]);

  // Handle file click and decrypt content
  const handleFileClick = async (file: { fileName: string; cid: string }) => {
    try {
      const content = await getFileFromPinata(file.cid, accessKey);
      setSelectedFile(file);
      setFileContent(content || "");
    } catch (error) {
      console.error("Error loading file:", error);
    }
  };

  // Save current file
  const handleSave = async () => {
    if (!selectedFile) return alert("No file selected!");
  
    try {
      const cid = await uploadFile(selectedFile.fileName, fileContent, accessKey);
      if (!cid) {
        alert("File upload failed!");
        return;
      }
  
      console.log("File uploaded with CID:", cid);
  
      // 更新索引
      const indexUpdated = await updateIndex(accessKey, selectedFile.fileName, cid);
      if (!indexUpdated) {
        alert("Failed to update index!");
        return;
      }
  
      alert(`File "${selectedFile.fileName}" saved successfully!`);
  
      // 重新获取文件列表
      setTimeout(async () => {
        console.log("Fetching updated file list after delay...");
        const updatedFileList = await getFileList(accessKey);
        setFileList(updatedFileList);
        setSelectedFile(null);
        setFileContent("");
      }, 3000); // 3秒延迟，确保IPFS同步完成
    } catch (error) {
      console.error("Error saving file:", error);
      alert("File save failed!");
    }
  };

  // Delete current file
  const handleDelete = async () => {
    if (!selectedFile) return alert("No file selected!");
  
    try {
      const success = await deleteFile(selectedFile.cid, selectedFile.fileName, accessKey);
      if (!success) {
        alert("File deletion failed!");
        return;
      }
  
      console.log("File deleted with CID:", selectedFile.cid);
  
      alert(`File "${selectedFile.fileName}" deleted successfully!`);
  
      // 重新获取最新的文件列表
      setTimeout(async () => {
        console.log("Fetching updated file list after delay...");
        const updatedFileList = await getFileList(accessKey);
        setFileList(updatedFileList);
        setSelectedFile(null);
        setFileContent("");
      }, 4000); // 4秒延迟，确保IPFS同步完成
    } catch (error) {
      console.error("Error deleting file:", error);
      alert("File delete failed!");
    }
  };

  // Add new file
  const handleAddFile = () => {
    const newFileName = prompt("Enter new file name:");
    if (!newFileName) {
      alert("File name cannot be empty!");
      return;
    }
    if (fileList.some((file) => file.fileName === newFileName)) {
      alert("File already exists!");
      return;
    }

    setFileList([...fileList, { fileName: newFileName, cid: "" }]);
    setSelectedFile({ fileName: newFileName, cid: "" });
    setFileContent("");
  };

  return (
    <div className="flex items-center justify-center w-full min-h-screen bg-gray-900 text-white">
      <Card className="w-full max-w-[95vw] bg-gray-800 shadow-xl rounded-lg overflow-hidden">
        <CardHeader className="bg-gray-700 py-4">
          <CardTitle className="text-center text-xl text-white">File Manager</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col lg:flex-row h-[calc(100vh-8rem)] p-4">
          {/* 文件列表 */}
          <Card className="w-full lg:w-1/4 h-full lg:mr-4 mb-4 lg:mb-0 bg-gray-700 overflow-hidden flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-gray-300 text-lg">My Files</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto border border-gray-600 rounded-lg p-2">
              <ul className="space-y-2">
                {fileList.map((file) => (
                  <li
                    key={file.cid}
                    onClick={() => handleFileClick(file)}
                    className={`p-2 cursor-pointer rounded-md transition-all ${
                      selectedFile?.cid === file.cid ? "bg-gray-500 text-white" : "hover:bg-gray-600 text-gray-300"
                    }`}
                  >
                    {file.fileName}
                  </li>
                ))}
              </ul>
            </CardContent>
            <div className="px-2 py-4">
              <button
                className="mt-4 w-full bg-gray-800 hover:bg-gray-900 text-white py-2 rounded-md transition duration-200"
                onClick={handleAddFile}
              >
                + Add File
              </button>
            </div>
          </Card>

          {/* 文件编辑区 */}
          <Card className="w-full lg:w-3/4 h-full bg-gray-700 flex flex-col">
            <CardHeader className="py-2">
              <CardTitle className="text-gray-300 text-lg">
                {selectedFile ? `Editing: ${selectedFile.fileName}` : "Select a file to view or edit"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-4">
              {/* 文本编辑区 */}
              <textarea
                className="w-full p-4 flex-1 bg-gray-600 text-white border border-gray-500 rounded-md focus:ring-2 focus:ring-blue-400 focus:outline-none resize-none"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                disabled={!selectedFile}
              />
              {/* 按钮 */}
              <div className="flex justify-end space-x-4">
                <button
                  className={`w-1/3 rounded-md transition duration-200 ${
                    selectedFile ? "bg-gray-800 hover:bg-gray-900 text-white" : "bg-gray-500 text-gray-300 cursor-not-allowed"
                  }`}
                  onClick={handleSave}
                  disabled={!selectedFile}
                >
                  Save
                </button>
                <button
                  className={`w-1/6 py-2 rounded-md transition duration-200 ${
                    selectedFile ? "bg-red-600 hover:bg-red-700 text-white" : "bg-gray-500 text-gray-300 cursor-not-allowed"
                  }`}
                  onClick={handleDelete}
                  disabled={!selectedFile}
                >
                  Delete
                </button>
              </div>
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}
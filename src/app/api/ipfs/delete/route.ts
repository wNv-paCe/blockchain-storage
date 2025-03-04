import { NextResponse } from "next/server";
import axios from "axios";

const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_JWT = process.env.PINATA_JWT;

export async function DELETE(req: Request) {
  try {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
      return NextResponse.json({ error: "Pinata API Key 未配置" }, { status: 500 });
    }

    const { cid } = await req.json();
    if (!cid) {
      return NextResponse.json({ error: "缺少 CID" }, { status: 400 });
    }

    // 设置请求头
    const headers: Record<string, string> = {};
    if (PINATA_JWT) {
      headers["Authorization"] = `Bearer ${PINATA_JWT}`;
    } else {
      headers["pinata_api_key"] = PINATA_API_KEY;
      headers["pinata_secret_api_key"] = PINATA_SECRET_KEY;
    }

    // 发送删除请求
    await axios.delete(`https://api.pinata.cloud/pinning/unpin/${cid}`, { headers });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("删除文件失败:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
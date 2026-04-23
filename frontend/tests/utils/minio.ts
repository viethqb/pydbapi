import { Client as MinioClient } from "minio"

const endPoint = process.env.MINIO_HOST || "localhost"
const port = Number(process.env.MINIO_PORT || 9000)
const accessKey = process.env.MINIO_ROOT_USER || "minioadmin"
const secretKey = process.env.MINIO_ROOT_PASSWORD || "minioadmin"

export const minio = new MinioClient({
  endPoint,
  port,
  useSSL: false,
  accessKey,
  secretKey,
})

export async function uploadBuffer(
  bucket: string,
  objectName: string,
  buffer: Buffer,
): Promise<void> {
  await minio.putObject(bucket, objectName, buffer, buffer.length, {
    "Content-Type":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
}

export async function removeObject(
  bucket: string,
  objectName: string,
): Promise<void> {
  try {
    await minio.removeObject(bucket, objectName)
  } catch {
    // ignore
  }
}

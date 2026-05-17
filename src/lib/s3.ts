/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { mkdirSync, existsSync, statSync, writeFileSync, readFileSync, unlinkSync } from "fs"
import { join } from "path"
import type { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"

const GENERATED_DIR = join(process.cwd(), "public", "generated")

function initLocalStorage() {
  if (!existsSync(GENERATED_DIR)) {
    mkdirSync(GENERATED_DIR, { recursive: true })
  }
}

export interface StoredFile {
  key: string
  filename: string
  mimeType: string
  size: number
}

export class FileStorage {
  private s3Client?: any
  private bucketName?: string

  constructor(s3Client?: any, bucketName?: string) {
    this.s3Client = s3Client
    this.bucketName = bucketName
    if (this.s3Client && !this.bucketName) {
      throw new Error("bucketName is required when providing an S3 client")
    }
  }

  async saveFile(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
    if (this.s3Client && this.bucketName) return this.saveToS3(filename, buffer, mimeType)
    return this.saveLocal(filename, buffer, mimeType)
  }

  async getFile(keyOrFilename: string): Promise<Buffer | null> {
    if (this.s3Client && this.bucketName) return this.getFromS3(keyOrFilename)
    return this.getLocal(keyOrFilename)
  }

  async deleteFile(keyOrFilename: string): Promise<boolean> {
    if (this.s3Client && this.bucketName) return this.deleteFromS3(keyOrFilename)
    return this.deleteLocal(keyOrFilename)
  }

  async getFileUrl(keyOrFilename: string, expiresIn = 3600): Promise<string> {
    if (this.s3Client && this.bucketName) return this.getS3PresignedUrl(keyOrFilename, expiresIn)
    return `/generated/${keyOrFilename}`
  }

  // ── Local Storage ────────────────────────────────────────────────

  private saveLocal(filename: string, buffer: Buffer, mimeType: string): StoredFile {
    initLocalStorage()
    const filePath = join(GENERATED_DIR, filename)
    writeFileSync(filePath, buffer)
    const fileSize = (() => { try { return statSync(filePath).size } catch { return 0 } })()
    return { key: filename, filename, mimeType, size: fileSize }
  }

  private getLocal(filename: string): Buffer | null {
    const filePath = join(GENERATED_DIR, filename)
    try { return readFileSync(filePath) } catch { return null }
  }

  private deleteLocal(filename: string): boolean {
    const filePath = join(GENERATED_DIR, filename)
    try { unlinkSync(filePath); return true } catch { return false }
  }

  // ── S3 Storage ──────────────────────────────────────────────────

  private async saveToS3(filename: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
    if (!this.s3Client || !this.bucketName) throw new Error("S3 not configured")
    const { PutObjectCommand } = require("@aws-sdk/client-s3")
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: filename,
        Body: buffer,
        ContentType: mimeType,
      }),
    )
    return { key: filename, filename, mimeType, size: buffer.length }
  }

  private async getFromS3(key: string): Promise<Buffer | null> {
    if (!this.s3Client || !this.bucketName) throw new Error("S3 not configured")
    const { GetObjectCommand } = require("@aws-sdk/client-s3")
    const res = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: key }))
    const chunks: any[] = []
    for await (const chunk of res.Body!) chunks.push(chunk)
    return Buffer.concat(chunks.map((c: any) => Buffer.from(c)))
  }

  private async deleteFromS3(key: string): Promise<boolean> {
    if (!this.s3Client || !this.bucketName) return false
    try {
      const { DeleteObjectCommand } = require("@aws-sdk/client-s3")
      await this.s3Client.send(new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }))
      return true
    } catch { return false }
  }

  private async getS3PresignedUrl(key: string, _expiresIn: number): Promise<string> {
    if (!this.s3Client || !this.bucketName) throw new Error("S3 not configured")
    // Return a local URL if @aws-sdk/s3-request-presigner is not installed
    try { require.resolve("@aws-sdk/s3-request-presigner") } catch {
      return `/generated/${key}`
    }
    try {
      const { getSignedUrl } = require("@aws-sdk/s3-request-presigner") as any
      const { GetObjectCommand } = require("@aws-sdk/client-s3") as any
      const cmd = new GetObjectCommand({ Bucket: this.bucketName, Key: key })
      return getSignedUrl(this.s3Client as any, cmd, { expiresIn: _expiresIn })
    } catch {
      return `/generated/${key}`
    }
  }
}

// Singleton — local storage by default; S3 activated via env vars
function createDefaultStorage(): FileStorage {
  const region = process.env.AWS_REGION
  const bucket = process.env.AWS_S3_BUCKET
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  if (region && bucket && accessKeyId && secretAccessKey) {
    try {
      const { S3Client } = require("@aws-sdk/client-s3") as any
      return new FileStorage(
        new S3Client({ region, credentials: { accessKeyId, secretAccessKey } }),
        bucket,
      )
    } catch {
      console.warn("S3 config found but client not available, falling back to local storage")
    }
  }
  return new FileStorage()
}

export type { S3Client }

export const fileStorage = createDefaultStorage()

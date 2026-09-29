import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// הצפנת סודות לשמירה ב-DB (AES-256-GCM).
// TOKEN_ENCRYPTION_KEY = 32 בתים ב-base64. יצירה: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
// פורמט: v1.<iv>.<tag>.<ciphertext> (base64url)

const VERSION = 'v1'

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY חסר')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY חייב להיות 32 בתים ב-base64')
  return key
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.')
  if (version !== VERSION || !iv || !tag || !data) throw new Error('פורמט הצפנה לא מוכר')
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

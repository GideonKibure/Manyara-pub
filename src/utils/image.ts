import { supabase } from '@/lib/supabase'

export async function storeProductImage(file: File): Promise<string> {
  return storeImage(file, 'product-images')
}

export async function storeProfileImage(file: File): Promise<string> {
  return storeImage(file, 'profile-images')
}

async function storeImage(file: File, bucket: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a photo.')
  if (file.size > 8_000_000) throw new Error('That photo is too large.')
  const dataUrl = await compressPhoto(file)
  if (!supabase) return dataUrl
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${crypto.randomUUID()}.jpg`
  const uploaded = await supabase.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (uploaded.error) return dataUrl
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

function compressPhoto(file: File) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(file)
    image.onload = () => {
      const max = 640
      const scale = Math.min(1, max / Math.max(image.width, image.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(url)
        reject(new Error('Could not read that photo.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const data = canvas.toDataURL('image/jpeg', 0.72)
      if (data.length > 400_000) reject(new Error('That photo is still too large. Try a smaller one.'))
      else resolve(data)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read that photo.'))
    }
    image.src = url
  })
}

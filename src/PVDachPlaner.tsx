import React, { useState } from 'react'

export default function PVDachPlaner() {
  const [image, setImage] = useState<string | null>(null)

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            const reader = new FileReader()
            reader.onload = () => setImage(reader.result as string)
            reader.readAsDataURL(file)
          }
        }}
      />
      {image && (
        <div style={{ marginTop: 20 }}>
          <img src={image} alt="Dach" style={{ maxWidth: '100%' }} />
        </div>
      )}
    </div>
  )
}
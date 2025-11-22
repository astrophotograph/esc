import './ImageManagement.css'

export function ImageManagement() {
  // TODO: Add state management when implementing image management
  // const [images, setImages] = useState<ImageData[]>([])
  // const [selectedImage, setSelectedImage] = useState<ImageData | null>(null)

  return (
    <div className="image-management">
      <h2>Image Management</h2>
      <div className="management-sections">
        <section className="image-library-section">
          <h3>Image Library</h3>
          <p className="placeholder">
            Image catalog with thumbnails and metadata will be implemented here
          </p>
        </section>

        <section className="image-viewer-section">
          <h3>Image Viewer</h3>
          <p className="placeholder">FITS image viewer with controls will be implemented here</p>
        </section>

        <section className="metadata-section">
          <h3>Metadata</h3>
          <p className="placeholder">Image metadata and FITS headers will be displayed here</p>
        </section>
      </div>
    </div>
  )
}

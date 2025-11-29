import './ImageSharing.css'

export function ImageSharing() {
  // TODO: Add state management when implementing image sharing
  // const [shares, setShares] = useState<ImageShare[]>([])

  return (
    <div className="image-sharing">
      <h2>Image Sharing</h2>
      <div className="sharing-sections">
        <section className="upload-section">
          <h3>Upload to Cloud</h3>
          <p className="placeholder">
            Image upload and cloud storage controls will be implemented here
          </p>
        </section>

        <section className="share-links-section">
          <h3>Share Links</h3>
          <p className="placeholder">Share link management will be implemented here</p>
        </section>

        <section className="gallery-section">
          <h3>Public Gallery</h3>
          <p className="placeholder">Public gallery view will be implemented here</p>
        </section>
      </div>
    </div>
  )
}

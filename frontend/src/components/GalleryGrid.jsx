export default function GalleryGrid({ images }) {
  return (
    <div className="gallery-grid">
      {images.map((img) => (
        <img key={img.id} src={img.image_url} alt={img.caption || ''} loading="lazy" />
      ))}
    </div>
  );
}

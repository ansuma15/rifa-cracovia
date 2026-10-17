import { useState } from "react";
import { video } from "../../content";
import { youtubeId } from "../../lib/format";
import styles from "./Video.module.css";

/**
 * Video horizontal 16:9.
 * Con YouTube se usa una "fachada": primero solo se muestra la portada y el
 * reproductor se carga al tocarla. Así la página abre rápido desde WhatsApp
 * (el reproductor pesa casi 1 MB) y YouTube no carga nada hasta que se pide.
 */
export function Video() {
  const id = youtubeId(video.youtube);
  const base = import.meta.env.BASE_URL;
  const [playing, setPlaying] = useState(false);

  if (id) {
    return (
      <div className={styles.frame}>
        {playing ? (
          <iframe
            className={styles.media}
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`}
            title={video.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button type="button" className={styles.facade} onClick={() => setPlaying(true)}>
            <img
              className={styles.media}
              src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
              alt=""
              loading="lazy"
            />
            <PlayIcon />
            <span className="visually-hidden">Reproducir el video: {video.title}</span>
          </button>
        )}
      </div>
    );
  }

  if (video.file) {
    return (
      <div className={styles.frame}>
        <video
          className={styles.media}
          src={`${base}video/${video.file}`}
          poster={video.poster ? `${base}video/${video.poster}` : undefined}
          controls
          playsInline
          preload="none"
          aria-label={video.title}
        />
      </div>
    );
  }

  return (
    <div className={`${styles.frame} ${styles.placeholder}`}>
      <PlayIcon />
      <span>Video próximamente</span>
    </div>
  );
}

function PlayIcon() {
  return (
    <span className={styles.play} aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
      </svg>
    </span>
  );
}

import { useEffect, useState } from 'react';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '@/lib/firebase';
export default function OdometerPhoto({ path, label }: { path?: string; label: string }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    setUrl('');
    setError(false);
    if (path && /^odometer-proof\/[\w-]+\/[\w-]+\.(jpg|jpeg|png|webp)$/.test(path)) {
      void getBlob(ref(storage, path), 8 * 1024 * 1024)
        .then((blob) => {
          if (!active) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        })
        .catch(() => {
          if (active) setError(true);
        });
    } else if (path) setError(true);
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return (
    <div className="rounded-lg border p-3">
      <p className="mb-2 text-xs font-medium">Odômetro · {label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={`Odômetro de ${label}`}
            className="h-36 w-full rounded-md object-contain"
          />
        </a>
      ) : (
        <p className="text-xs text-muted-foreground">
          {error
            ? 'Foto indisponível (acesso ou conexão).'
            : path
              ? 'Carregando foto…'
              : 'Sem comprovante registrado.'}
        </p>
      )}
    </div>
  );
}

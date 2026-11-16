import { useEffect, useRef, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import app from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const request = httpsCallable<
  Record<string, unknown>,
  {
    suggestions?: Array<{ placeId: string; label: string }>;
    formattedAddress?: string;
  }
>(getFunctions(app, 'southamerica-east1'), 'googleRoutePlanner');

const createToken = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

/** Mesmo autocomplete/details do planejador existente. Nunca grava sugestões não confirmadas como endereço validado. */
export default function AddressAutocomplete({
  value,
  onChange,
  label = 'Endereço',
  required = false,
}: {
  value: string;
  onChange: (value: string, placeId: string | null) => void;
  label?: string;
  required?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<Array<{ placeId: string; label: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const token = useRef(createToken());
  const generation = useRef(0);

  useEffect(() => {
    if (!value || value.trim().length < 3 || !editing || confirmed) {
      setSuggestions([]);
      return;
    }
    let active = true;
    const version = ++generation.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await request({
          action: 'autocomplete',
          input: value.trim(),
          sessionToken: token.current,
        });
        if (active && generation.current === version)
          setSuggestions(response.data.suggestions || []);
      } catch {
        if (active && generation.current === version) setSuggestions([]);
      } finally {
        if (active && generation.current === version) setLoading(false);
      }
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value, editing, confirmed]);

  const select = async (placeId: string, fallback: string) => {
    setLoading(true);
    try {
      const response = await request({ action: 'details', placeId, sessionToken: token.current });
      onChange(response.data.formattedAddress || fallback, placeId);
      setConfirmed(true);
      setEditing(false);
      setSuggestions([]);
      token.current = createToken();
    } catch {
      toast.error('Não foi possível confirmar o endereço no Google Maps.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-w-0 space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <MapPin className="h-4 w-4 text-primary" /> {label}
        {required ? ' *' : ''}
      </label>
      <div className="relative">
        <Input
          value={value}
          autoComplete="off"
          aria-label={label}
          placeholder="Rua, número, bairro, cidade ou CEP"
          maxLength={450}
          onChange={(e) => {
            setConfirmed(false);
            setEditing(true);
            onChange(e.target.value, null);
          }}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {confirmed && (
        <p className="text-[11px] text-emerald-600">Endereço confirmado pelo Google Maps</p>
      )}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label="Sugestões de endereço"
          className="absolute left-0 right-0 top-full z-[100] mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.placeId}
              type="button"
              role="option"
              aria-selected={false}
              className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-accent"
              onClick={() => select(suggestion.placeId, suggestion.label)}
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

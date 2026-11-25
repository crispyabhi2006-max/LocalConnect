import { useEffect, useState } from 'react';
import {
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import { MapPin } from 'lucide-react';
import type { Business } from '../types';

interface BusinessMarkerProps {
  business: Business;
  isSelected: boolean;
  onSelect: (business: Business) => void;
  onNavigateBusiness?: (businessId: string) => void;
}

function BusinessMarker({
  business,
  isSelected,
  onSelect,
  onNavigateBusiness,
}: BusinessMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: business.lat, lng: business.lng }}
        onClick={() => onSelect(business)}
        title={business.name}
      >
        <Pin
          background={isSelected ? '#6d28d9' : '#2563eb'}
          borderColor={isSelected ? '#4c1d95' : '#1d4ed8'}
          glyphColor="#ffffff"
          scale={isSelected ? 1.2 : 1.0}
        />
      </AdvancedMarker>
      {isSelected && marker && (
        <InfoWindow anchor={marker} onCloseClick={() => onSelect(business)} maxWidth={260}>
          <div className="p-1 text-slate-900">
            <p className="font-semibold text-sm">{business.name}</p>
            <p className="text-xs text-slate-600 mt-0.5">
              {business.category} · {business.city}
            </p>
            <p className="text-xs text-slate-500 mt-1">{business.address}</p>
            {onNavigateBusiness && (
              <button
                type="button"
                onClick={() => onNavigateBusiness(business.id)}
                className="mt-2 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
              >
                Open business profile
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface GoogleMapsViewProps {
  businesses?: Business[];
  center?: { lat: number; lng: number };
  zoom?: number;
  heightClass?: string;
  selectedBusinessId?: string | null;
  onSelectBusiness?: (business: Business) => void;
  onNavigateBusiness?: (businessId: string) => void;
  interactivePicker?: boolean;
  pickedLocation?: { lat: number; lng: number } | null;
  onPickLocation?: (coords: { lat: number; lng: number }) => void;
  mapsConfigured: boolean;
}

export function GoogleMapsView({
  businesses = [],
  center = { lat: 37.7749, lng: -122.4194 },
  zoom = 12,
  heightClass = 'h-[420px]',
  selectedBusinessId = null,
  onSelectBusiness,
  onNavigateBusiness,
  interactivePicker = false,
  pickedLocation = null,
  onPickLocation,
  mapsConfigured,
}: GoogleMapsViewProps) {
  const status = useApiLoadingStatus();
  const [activeId, setActiveId] = useState<string | null>(selectedBusinessId);

  useEffect(() => {
    setActiveId(selectedBusinessId);
  }, [selectedBusinessId]);

  if (!mapsConfigured) {
    return (
      <div
        className={`${heightClass} w-full rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center`}
      >
        <MapPin className="w-8 h-8 text-blue-600 mb-2" />
        <p className="text-sm font-semibold text-slate-900">Google Maps Ready for Key</p>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Coordinates: {center.lat.toFixed(4)}, {center.lng.toFixed(4)}. Configure{' '}
          <code className="font-mono">VITE_GOOGLE_MAPS_API_KEY</code> to render live interactive map
          tiles.
        </p>
      </div>
    );
  }

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div
        className={`${heightClass} w-full rounded-2xl border border-amber-200 bg-amber-50 flex flex-col items-center justify-center p-6 text-center`}
      >
        <MapPin className="w-8 h-8 text-amber-600 mb-2" />
        <p className="text-sm font-semibold text-amber-900">Map temporarily unavailable</p>
        <p className="text-xs text-amber-700 mt-1 max-w-sm">
          Check your Google Maps Platform API key or quota settings. Coordinates:{' '}
          {center.lat.toFixed(4)}, {center.lng.toFixed(4)}.
        </p>
      </div>
    );
  }

  return (
    <div className={`${heightClass} w-full rounded-2xl overflow-hidden border border-slate-200`}>
      <GoogleMap
        mapId={import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'}
        defaultCenter={center}
        center={center}
        defaultZoom={zoom}
        gestureHandling="greedy"
        disableDefaultUI={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          if (interactivePicker && onPickLocation && ev.detail.latLng) {
            onPickLocation({ lat: ev.detail.latLng.lat, lng: ev.detail.latLng.lng });
          }
        }}
      >
        {interactivePicker && pickedLocation && (
          <AdvancedMarker position={pickedLocation} title="Selected business location">
            <Pin background="#6d28d9" borderColor="#4c1d95" glyphColor="#ffffff" scale={1.2} />
          </AdvancedMarker>
        )}

        {businesses.map((biz) => (
          <BusinessMarker
            key={biz.id}
            business={biz}
            isSelected={activeId === biz.id}
            onSelect={(b) => {
              setActiveId(b.id);
              onSelectBusiness?.(b);
            }}
            onNavigateBusiness={onNavigateBusiness}
          />
        ))}
      </GoogleMap>
    </div>
  );
}

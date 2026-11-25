import { useState } from 'react';
import { ArrowUpRight, Heart, MapPin, Star } from 'lucide-react';
import { CATEGORY_FALLBACK_IMAGES, type Business } from '../types';

interface BusinessCardProps {
  business: Business;
  distanceKm?: number | null;
  isFavourite?: boolean;
  onToggleFavourite?: (business: Business) => void;
  onSelect: (businessId: string) => void;
}

export function BusinessCard({
  business,
  distanceKm,
  isFavourite = false,
  onToggleFavourite,
  onSelect,
}: BusinessCardProps) {
  const [imgError, setImgError] = useState(false);
  const coverSrc =
    !imgError && business.coverUrl
      ? business.coverUrl
      : CATEGORY_FALLBACK_IMAGES[business.category];

  return (
    <article
      onClick={() => onSelect(business.id)}
      className="group bg-white border border-slate-200/90 rounded-2xl overflow-hidden hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/[0.04] transition-all duration-200 cursor-pointer flex flex-col"
    >
      {/* Large Airbnb-inspired photography container */}
      <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
        {!imgError ? (
          <img
            src={coverSrc}
            alt={business.name}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300 ease-out"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-50 flex flex-col items-center justify-center p-6 text-center">
            <MapPin className="w-7 h-7 text-blue-600 mb-2" />
            <span className="text-sm font-semibold text-slate-700">{business.name}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/35 via-transparent to-transparent pointer-events-none" />

        {onToggleFavourite && (
          <button
            type="button"
            aria-label={isFavourite ? 'Remove from favourites' : 'Save to favourites'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite(business);
            }}
            className="absolute top-3 right-3 w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm hover:bg-white flex items-center justify-center shadow-sm transition-transform hover:scale-105 cursor-pointer"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isFavourite ? 'fill-rose-500 text-rose-500' : 'text-slate-700'
              }`}
            />
          </button>
        )}
      </div>

      {/* Card Content */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-blue-600 truncate">
            {business.category}
          </p>

          <div className="mt-1 flex items-start justify-between gap-2">
            <h3 className="font-display font-bold text-base text-[#0b1220] group-hover:text-blue-600 transition-colors line-clamp-1">
              {business.name}
            </h3>
            <div className="flex items-center gap-1 shrink-0 text-sm font-semibold text-[#0b1220] tabular-nums">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{business.reviewCount > 0 ? business.ratingAvg.toFixed(1) : 'New'}</span>
            </div>
          </div>

          <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
            <span className="truncate">{business.city}</span>
            {distanceKm !== undefined && distanceKm !== null && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums shrink-0">{distanceKm.toFixed(1)} km</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className="tabular-nums shrink-0">
              {business.reviewCount} {business.reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          <p className="mt-2.5 text-sm text-slate-600 line-clamp-2 leading-relaxed">
            {business.description}
          </p>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          <span className="text-xs text-slate-500 truncate">{business.address}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 group-hover:text-indigo-600 whitespace-nowrap shrink-0">
            View Details
            <ArrowUpRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </article>
  );
}

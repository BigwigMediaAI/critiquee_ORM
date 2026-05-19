import { FcGoogle } from 'react-icons/fc';
import {
  FaFacebook, FaInstagram, FaLinkedin, FaTripadvisor, FaYoutube,
  FaReddit, FaYelp, FaAirbnb, FaHotel,
} from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import {
  SiExpedia, SiTrustpilot, SiFoursquare, SiZillow,
} from 'react-icons/si';
import {
  Building2, Compass, Map, Tent, MapPin, Home, KeyRound, Hotel, BedDouble, UtensilsCrossed,
} from 'lucide-react';

// Display config for icons / labels per platform.
//   color: primary brand color
//   bg:    container background tailwind class
//   label: human-readable label
//
// `Icon` is rendered with `size` and `color` props (lucide / react-icons).
// Lucide icons accept `size` + `color` like react-icons, so they're interchangeable.
export const PLATFORM_CONFIG = {
  // Reviews & Local
  google: { Icon: FcGoogle, color: '#DB4437', bg: 'bg-white border', label: 'Google' },
  yelp: { Icon: FaYelp, color: '#D32323', bg: 'bg-red-50', label: 'Yelp' },
  trustpilot: { Icon: SiTrustpilot, color: '#00B67A', bg: 'bg-emerald-50', label: 'Trustpilot' },
  foursquare: { Icon: SiFoursquare, color: '#F94877', bg: 'bg-pink-50', label: 'Foursquare' },
  zomato: { Icon: UtensilsCrossed, color: '#E23744', bg: 'bg-red-50', label: 'Zomato' },
  justdial: { Icon: Building2, color: '#FFB200', bg: 'bg-amber-50', label: 'JustDial' },

  // Social
  facebook: { Icon: FaFacebook, color: '#1877F2', bg: 'bg-blue-50', label: 'Facebook' },
  instagram: { Icon: FaInstagram, color: '#E4405F', bg: 'bg-pink-50', label: 'Instagram' },
  linkedin: { Icon: FaLinkedin, color: '#0A66C2', bg: 'bg-blue-50', label: 'LinkedIn' },
  x: { Icon: FaXTwitter, color: '#000000', bg: 'bg-gray-100 dark:bg-gray-800', label: 'X (Twitter)' },
  youtube: { Icon: FaYoutube, color: '#FF0000', bg: 'bg-red-50', label: 'YouTube' },
  reddit: { Icon: FaReddit, color: '#FF4500', bg: 'bg-orange-50', label: 'Reddit' },

  // Hospitality
  tripadvisor: { Icon: FaTripadvisor, color: '#00AF87', bg: 'bg-emerald-50', label: 'TripAdvisor' },
  booking: { Icon: BedDouble, color: '#003580', bg: 'bg-blue-50', label: 'Booking.com' },
  expedia: { Icon: SiExpedia, color: '#FFCC00', bg: 'bg-yellow-50', label: 'Expedia' },
  hotels_com: { Icon: FaHotel, color: '#D32F2F', bg: 'bg-red-50', label: 'Hotels.com' },
  agoda: { Icon: Hotel, color: '#FF5A5F', bg: 'bg-red-50', label: 'Agoda' },
  opentable: { Icon: Building2, color: '#DA3743', bg: 'bg-red-50', label: 'OpenTable' },

  // Travel & Tours
  viator: { Icon: Compass, color: '#328E04', bg: 'bg-green-50', label: 'Viator' },
  getyourguide: { Icon: Map, color: '#FF5533', bg: 'bg-orange-50', label: 'GetYourGuide' },
  airbnb: { Icon: FaAirbnb, color: '#FF5A5F', bg: 'bg-red-50', label: 'Airbnb' },

  // Properties & Real Estate
  zillow: { Icon: SiZillow, color: '#006AFF', bg: 'bg-blue-50', label: 'Zillow' },
  realtor: { Icon: Home, color: '#D92228', bg: 'bg-red-50', label: 'Realtor.com' },

  // Generic fallbacks (kept for backward-compat)
  tent: { Icon: Tent, color: '#0EA5E9', bg: 'bg-sky-50', label: 'Tent' },
  pin: { Icon: MapPin, color: '#0EA5E9', bg: 'bg-sky-50', label: 'Local' },
  key: { Icon: KeyRound, color: '#0EA5E9', bg: 'bg-sky-50', label: 'API' },
};

export function getPlatformLabel(platform) {
  return PLATFORM_CONFIG[platform?.toLowerCase()]?.label || platform;
}

export default function PlatformIcon({ platform, size = 18, showLabel = false, className = '' }) {
  const config = PLATFORM_CONFIG[platform?.toLowerCase()];
  if (!config) return <span className="text-xs text-muted-foreground">{platform}</span>;
  const { Icon, color } = config;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Icon size={size} color={color} style={{ flexShrink: 0 }} />
      {showLabel && <span className="text-sm font-medium">{config.label}</span>}
    </span>
  );
}

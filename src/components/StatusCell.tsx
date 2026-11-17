import { AlertTriangle, CheckCircle2, HelpCircle, Minus, RefreshCw, XCircle } from 'lucide-react';
import type { CompatibilityStatus, PtfInstallStatus } from '../types/compatibility';

interface CompatibilityStatusLabelProps {
  status: CompatibilityStatus;
  label: string;
  compact?: boolean;
}

export function CompatibilityStatusLabel({ status, label, compact = false }: CompatibilityStatusLabelProps) {
  switch (status) {
    case 'compatible':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'compatible_ptf':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{compact ? 'PTF Req.' : label}</span>
        </span>
      );
    case 'upgrade_available':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-orange-700 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'incompatible':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'no_info':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <HelpCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-normal text-slate-500 whitespace-nowrap">
          <Minus className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}

interface PtfStatusLabelProps {
  status: PtfInstallStatus;
  label: string;
}

export function PtfStatusLabel({ status, label }: PtfStatusLabelProps) {
  switch (status) {
    case 'applied':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'not_applied':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'available':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'superseded':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 whitespace-nowrap">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    case 'not_available':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-700 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{label}</span>
        </span>
      );
  }
}

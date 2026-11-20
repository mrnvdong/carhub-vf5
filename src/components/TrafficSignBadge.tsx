import React from 'react';

interface ParkingSignSvgProps {
  type: 'no_stopping' | 'no_parking';
  className?: string;
}

/**
 * Biển báo giao thông Việt Nam chuẩn QCVN 41:2019/BGTVT:
 * - P.130 (Cấm dừng xe và đỗ xe): nền xanh dương, viền đỏ, gạch chéo chữ X màu đỏ
 * - P.131a (Cấm đỗ xe): nền xanh dương, viền đỏ, 1 gạch chéo màu đỏ
 */
export const ParkingSignSvg: React.FC<ParkingSignSvgProps> = ({
  type,
  className = 'w-10 h-10',
}) => (
  <svg
    viewBox="0 0 64 64"
    className={className}
    role="img"
    aria-label={type === 'no_stopping' ? 'Biển P.130 Cấm dừng và cấm đỗ' : 'Biển P.131a Cấm đỗ xe'}
  >
    <circle cx="32" cy="32" r="29" fill="#1d4ed8" stroke="#ffffff" strokeWidth="2.5" />
    <circle cx="32" cy="32" r="25" fill="#1d4ed8" stroke="#e11d48" strokeWidth="7" />
    <line x1="15" y1="15" x2="49" y2="49" stroke="#e11d48" strokeWidth="6.5" strokeLinecap="butt" />
    {type === 'no_stopping' && (
      <line x1="49" y1="15" x2="15" y2="49" stroke="#e11d48" strokeWidth="6.5" strokeLinecap="butt" />
    )}
  </svg>
);

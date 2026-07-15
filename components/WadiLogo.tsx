type WadiLogoProps = {
  className?: string;
  markClassName?: string;
  textClassName?: string;
  showText?: boolean;
  label?: string;
};

export default function WadiLogo({
  className = '',
  markClassName = '',
  textClassName = '',
  showText = true,
  label = 'Wadi',
}: WadiLogoProps) {
  return (
    <span className={`wadi-logo-ui ${className}`} aria-label={showText ? undefined : label}>
      <svg
        className={`wadi-logo-mark ${markClassName}`}
        viewBox="0 0 84 42"
        role="img"
        aria-hidden={showText ? 'true' : undefined}
        focusable="false"
      >
        <path
          className="wadi-logo-bridge"
          d="M10 14L26 28L42 14L58 28L74 14"
        />
        <circle className="wadi-logo-node wadi-logo-node-1" cx="10" cy="14" r="9" />
        <circle className="wadi-logo-node wadi-logo-node-2" cx="26" cy="28" r="9" />
        <circle className="wadi-logo-node wadi-logo-node-3" cx="42" cy="14" r="9" />
        <circle className="wadi-logo-node wadi-logo-node-4" cx="58" cy="28" r="9" />
        <circle className="wadi-logo-node wadi-logo-node-5" cx="74" cy="14" r="9" />
      </svg>
      {showText ? <span className={`wadi-logo-text ${textClassName}`}>{label}</span> : null}
    </span>
  );
}

export default function Button({
  text,
  onClick,
  Icon = null,
  iconSize = 20,
  className = "button",
  disabled = false,
}) {
  return (
    <button onClick={onClick} className={className} disabled={disabled}>
      {Icon && <Icon size={iconSize} />}
      {text}
    </button>
  );
}

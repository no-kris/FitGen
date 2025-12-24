export default function Button({
  text,
  onClick,
  Icon = null,
  iconSize = 20,
  className = "button",
}) {
  return (
    <button onClick={onClick} className={className}>
      {Icon && <Icon size={iconSize} />}
      {text}
    </button>
  );
}

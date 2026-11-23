export default function Button({
  text,
  onClick,
  Icon = null,
  iconSize = 20,
  className = "button",
  disabled = false,
  ...rest
}) {
  return (
    <button
      onClick={onClick}
      className={className}
      disabled={disabled}
      {...rest}
    >
      {Icon && <Icon size={iconSize} />}
      {text}
    </button>
  );
}

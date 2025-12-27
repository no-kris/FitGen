export default function TextInput({
  label,
  value,
  onChange,
  type = "text",
  id,
  className,
  placeholder,
}) {
  return (
    <>
      {label && (
        <label htmlFor={id} className="text-lg font-bold text-muted uppercase">
          {label}
        </label>
      )}
      <input
        type={type}
        id={id}
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
      />
    </>
  );
}

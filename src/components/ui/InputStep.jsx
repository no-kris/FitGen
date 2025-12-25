import TextInput from "./TextInput";
import Button from "./Button";

export default function InputStep({ value, handleChange, label, placeholder }) {
  return (
    <>
      <TextInput
        id={label}
        label={label}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className="mb-4 w-full input"
      />
      <Button
        onClick={() => {
          handleChange({ target: { value: "None" } });
        }}
        className="text-xl font-bold w-full p-4 text-primary"
        text={`No ${label}`}
      />
    </>
  );
}

import Button from "./Button";

export default function NavIcon({ icon: Icon, onClick, label, active }) {
  return (
    <Button
      onClick={onClick}
      className={`btn-nav flex flex-col items-center gap-2 ${
        active ? "active" : ""
      }`}
      text={label}
      Icon={Icon}
    />
  );
}

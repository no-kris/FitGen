import Button from "./Button";

export default function DisplayStep({ handleClick, formData, list, item }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {list.map((option) => (
        <div key={option} className="flex items-center w-full">
          <Button
            onClick={() => handleClick(option)}
            className={`button btn-toggle p-4 ${
              formData[item].includes(option) ? "btn-selected" : ""
            }`}
            text={option.toUpperCase()}
          />
        </div>
      ))}
    </div>
  );
}

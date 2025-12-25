import Slider from "./Slider";

export default function SliderStep({ value, handleChange, label, options }) {
  return (
    <>
      <div className="flex justify-between">
        <span className="text-lg font-bold text-muted">{label}</span>
        <span className="text-lg font-bold text-primary">
          {value} {options.unit}
        </span>
      </div>
      <Slider
        min={options.min}
        max={options.max}
        step={options.step}
        value={value}
        handleChange={handleChange}
      />
    </>
  );
}

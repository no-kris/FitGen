export default function Slider({ min, max, step, value, handleChange }) {
  return (
    <>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        className="slider"
      />
    </>
  );
}

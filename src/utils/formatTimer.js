const formatTimer = (time) => {
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2, "0")}`;
};

export default formatTimer;

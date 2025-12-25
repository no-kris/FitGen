const toggleDay = (day, setFormData, formData) => {
  const updatedDays = formData.selectedDays.includes(day)
    ? formData.selectedDays.filter((d) => d !== day)
    : [...formData.selectedDays, day];
  setFormData({ ...formData, selectedDays: updatedDays });
};

export default toggleDay;

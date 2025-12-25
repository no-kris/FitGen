const extractJsonFromText = (text) => {
  const jsonText = text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (jsonText) {
    return JSON.parse(jsonText);
  }
  return null;
};

// let test = extractJsonFromText(
//   'This is a test string with some JSON data: {"name": "John", "age": 30, "city": "New York"}'
// );
// console.log(test);

export default extractJsonFromText;

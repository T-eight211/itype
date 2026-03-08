export function smoothWithValueWindow(
  arr: number[],
  windowSize: number,
  valueWindowSize: number,
  getter = (value: number): number => value,
): number[] {
  const get = getter;
  const result = [];

  for (let i = 0; i < arr.length; i += 1) {
    const currentValue = get(arr[i] as number);
    const leftOffset = i - windowSize;
    const from = leftOffset >= 0 ? leftOffset : 0;
    const to = i + windowSize + 1;

    let count = 0;
    let sum = 0;

    for (let j = from; j < to && j < arr.length; j += 1) {
      const neighborValue = get(arr[j] as number);

      // Only include values that are within the value window
      if (Math.abs(neighborValue - currentValue) <= valueWindowSize) {
        sum += neighborValue;
        count += 1;
      }
    }

    // If no values were within the window, use the original value
    result[i] = count > 0 ? sum / count : currentValue;
  }

  return result;
}
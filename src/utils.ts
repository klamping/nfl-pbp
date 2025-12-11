import _ from 'lodash';

type FlatObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is FlatObject {
  return _.isPlainObject(value);
}

export function flattenObject(
  obj: FlatObject,
  parentKey: string = '',
  result: FlatObject = {},
): FlatObject {
  return _.transform(obj, (res: FlatObject, value: unknown, key: string) => {
    const newKey = parentKey ? `${parentKey}_${key}` : key;

    if (isPlainObject(value)) {
      // Recurse into nested plain objects
      flattenObject(value, newKey, res);
    } else {
      res[newKey] = value;
    }
  }, result);
}
import { keccak256, toHex, Abi, AbiEvent } from 'viem';

interface ExtractedEvent {
  name: string;
  signature: string;
  topic0: string;
  abiItem: AbiEvent;
  inputs: {
    name: string;
    type: string;
    indexed: boolean;
  }[];
}

/**
 * Extract all events from a contract ABI
 * Returns event definitions with computed topic0 hashes
 */
export function extractEventsFromAbi(abi: any[]): ExtractedEvent[] {
  const events: ExtractedEvent[] = [];

  for (const item of abi) {
    // Only process event items
    if (item.type !== 'event') continue;

    try {
      const eventName = item.name;
      const inputs = item.inputs || [];

      // Build event signature: EventName(type1,type2,...)
      const inputTypes = inputs.map((input: any) => formatType(input));
      const signature = `${eventName}(${inputTypes.join(',')})`;

      // Compute topic0 (keccak256 of signature)
      const topic0 = keccak256(toHex(signature));

      // Extract input info
      const inputInfo = inputs.map((input: any) => ({
        name: input.name || '',
        type: input.type,
        indexed: input.indexed || false,
      }));

      events.push({
        name: eventName,
        signature,
        topic0,
        abiItem: item as AbiEvent,
        inputs: inputInfo,
      });
    } catch (error) {
      console.warn(`Failed to parse event: ${item.name}`, error);
    }
  }

  return events;
}

/**
 * Format a type for the event signature
 * Handles tuples and arrays
 */
function formatType(input: any): string {
  if (input.type === 'tuple') {
    // Handle tuple types
    const components = input.components || [];
    const componentTypes = components.map((c: any) => formatType(c));
    return `(${componentTypes.join(',')})`;
  }

  if (input.type.startsWith('tuple[')) {
    // Handle tuple arrays
    const components = input.components || [];
    const componentTypes = components.map((c: any) => formatType(c));
    const arrayPart = input.type.slice(5); // e.g., "[]" or "[2]"
    return `(${componentTypes.join(',')})${arrayPart}`;
  }

  return input.type;
}

/**
 * Get a specific event ABI item by name
 */
export function getEventAbiByName(abi: any[], eventName: string): AbiEvent | null {
  for (const item of abi) {
    if (item.type === 'event' && item.name === eventName) {
      return item as AbiEvent;
    }
  }
  return null;
}

/**
 * Compute topic0 for an event signature
 */
export function computeTopic0(signature: string): string {
  return keccak256(toHex(signature));
}

/**
 * Validate that an ABI is properly formatted
 */
export function validateAbi(abi: any[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(abi)) {
    return { valid: false, errors: ['ABI must be an array'] };
  }

  if (abi.length === 0) {
    return { valid: false, errors: ['ABI is empty'] };
  }

  let hasEvents = false;

  for (let i = 0; i < abi.length; i++) {
    const item = abi[i];

    if (typeof item !== 'object') {
      errors.push(`Item ${i}: must be an object`);
      continue;
    }

    if (!item.type) {
      errors.push(`Item ${i}: missing 'type' field`);
      continue;
    }

    if (item.type === 'event') {
      hasEvents = true;

      if (!item.name) {
        errors.push(`Item ${i}: event missing 'name' field`);
      }

      if (!Array.isArray(item.inputs)) {
        errors.push(`Item ${i}: event '${item.name}' missing 'inputs' array`);
      }
    }
  }

  if (!hasEvents) {
    errors.push('ABI contains no events');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse ABI from JSON string or object
 */
export function parseAbi(abiInput: string | any[]): any[] {
  if (typeof abiInput === 'string') {
    try {
      return JSON.parse(abiInput);
    } catch (error) {
      throw new Error('Invalid ABI JSON string');
    }
  }

  if (Array.isArray(abiInput)) {
    return abiInput;
  }

  throw new Error('ABI must be a JSON array or string');
}

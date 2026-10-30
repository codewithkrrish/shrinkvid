/* Batch queue rules — pure, no DOM. Up to 3 videos, processed
   one at a time in queue order. Files themselves are opaque
   here; only counts and names are inspected. */

export const MAX_QUEUE = 3;

export function canAddToQueue(queueLength) {
  return queueLength < MAX_QUEUE;
}

export function addToQueue(queue, item) {
  if (queue.length >= MAX_QUEUE) {
    return { queue, error: `Queue is full (max ${MAX_QUEUE} videos). Remove one before adding another.` };
  }
  if (queue.some((q) => q.name === item.name && q.size === item.size)) {
    return { queue, error: 'That video is already in the queue.' };
  }
  return { queue: [...queue, item], error: '' };
}

export function removeFromQueue(queue, index) {
  return queue.filter((_, i) => i !== index);
}

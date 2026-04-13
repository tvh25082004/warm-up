/** Key dùng chung: giáo viên giao bài → học sinh (tk demo `student`) đọc cùng key. */
export const STUDENT_ASSIGNMENTS_STORAGE_KEY = 'speaking_assignments_student';
const LEGACY_ASSIGNMENTS_KEY = 'speaking_assignments';

const BROADCAST_EVENT = 'warmup-student-assignments-changed';
const BROADCAST_CHANNEL = 'warmup-student-assignments';

export function readStudentAssignmentsFromStorage() {
  try {
    const parseArray = (raw) => {
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    };

    const candidates = [];
    candidates.push(...parseArray(localStorage.getItem(STUDENT_ASSIGNMENTS_STORAGE_KEY)));
    candidates.push(...parseArray(localStorage.getItem(LEGACY_ASSIGNMENTS_KEY)));

    Object.keys(localStorage).forEach((key) => {
      if (!key.startsWith('speaking_assignments_') || key === STUDENT_ASSIGNMENTS_STORAGE_KEY) return;
      candidates.push(...parseArray(localStorage.getItem(key)));
    });

    if (!candidates.length) return [];

    const seen = new Set();
    const unique = [];
    candidates.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const dedupeKey = String(item.id ?? `${item.name || ''}|${item.createdAt || ''}|${item.script || ''}`);
      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      unique.push(item);
    });

    unique.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());

    // Chuẩn hóa về key chính để các màn hình luôn đọc cùng một nguồn.
    localStorage.setItem(STUDENT_ASSIGNMENTS_STORAGE_KEY, JSON.stringify(unique));
    return unique;
  } catch {
    return [];
  }
}

/** Gọi sau khi ghi localStorage để tab/window khác (và listener trong cùng app) cập nhật ngay. */
export function broadcastStudentAssignmentsChanged() {
  try {
    window.dispatchEvent(new CustomEvent(BROADCAST_EVENT));
  } catch (_) {
    /* ignore */
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel(BROADCAST_CHANNEL);
      bc.postMessage({ type: 'updated', t: Date.now() });
      bc.close();
    }
  } catch (_) {
    /* ignore */
  }
}

/**
 * Đăng ký làm mới khi có bài mới (cùng origin).
 * Bổ sung cho sự kiện `storage` (chỉ tab khác) và polling.
 */
export function subscribeStudentAssignmentsRefresh(callback) {
  const fn = () => callback();
  window.addEventListener(BROADCAST_EVENT, fn);

  let bc = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel(BROADCAST_CHANNEL);
      bc.addEventListener('message', fn);
    }
  } catch (_) {
    /* ignore */
  }

  return () => {
    window.removeEventListener(BROADCAST_EVENT, fn);
    if (bc) {
      bc.removeEventListener('message', fn);
      bc.close();
    }
  };
}

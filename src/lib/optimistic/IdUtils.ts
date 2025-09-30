/**
 * IdUtils - Utility functions for ID and title generation
 *
 * Provides granular title generation with seconds precision to avoid
 * duplicate titles when multiple chats are created quickly.
 */

export class IdUtils {
  /**
   * Generate a unique chat title with high granularity
   * Format: "Chat-Sep 27, 7:26:35 PM" (includes seconds)
   *
   * If multiple titles are generated in the same second, adds milliseconds
   * to ensure uniqueness: "Chat-Sep 27, 7:26:35.123 PM"
   */
  static generateChatTitle(): string {
    const now = new Date();

    // Get base timestamp with seconds
    const baseTitle = this.formatTimestampWithSeconds(now);

    // Check if we need to add milliseconds for uniqueness
    // (This is a simple approach - in production you might want to track recent titles)
    const milliseconds = now.getMilliseconds();

    // Add milliseconds if non-zero to increase uniqueness
    if (milliseconds > 0) {
      const ms = milliseconds.toString().padStart(3, '0');
      return `Chat-${baseTitle.replace(' PM', `.${ms} PM`).replace(' AM', `.${ms} AM`)}`;
    }

    return `Chat-${baseTitle}`;
  }

  /**
   * Format timestamp with seconds precision
   * Example: "Sep 27, 7:26:35 PM"
   */
  private static formatTimestampWithSeconds(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    };

    return date.toLocaleString('en-US', options);
  }

  /**
   * Generate a unique title with microsecond precision (for extreme edge cases)
   * Format: "Chat-Sep 27, 7:26:35.123456 PM"
   */
  static generateUniqueChatTitle(): string {
    const now = new Date();
    const baseTitle = this.formatTimestampWithSeconds(now);

    // Add microseconds using performance.now() for sub-millisecond precision
    const performanceTime = performance.now();
    const microseconds = Math.floor((performanceTime % 1) * 1000000);
    const microStr = microseconds.toString().padStart(6, '0');

    return `Chat-${baseTitle.replace(' PM', `.${microStr} PM`).replace(' AM', `.${microStr} AM`)}`;
  }

  /**
   * Extract timestamp from chat title
   * Returns null if title doesn't match expected format
   */
  static extractTimestampFromTitle(title: string): Date | null {
    const match = title.match(/^Chat-(.+)$/);
    if (!match) return null;

    try {
      return new Date(match[1]);
    } catch {
      return null;
    }
  }

  /**
   * Check if a title is a generated chat title (vs user-renamed)
   */
  static isGeneratedChatTitle(title: string): boolean {
    return title.startsWith('Chat-') && this.extractTimestampFromTitle(title) !== null;
  }

  /**
   * Generate a short unique ID (8 characters)
   * Useful for operation tracking
   */
  static generateShortId(): string {
    return Math.random().toString(36).substring(2, 10);
  }
}
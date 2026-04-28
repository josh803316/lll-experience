/**
 * LLL Proprietary Rating Engine
 * Handles the logic for the 0-10 draft success scale and
 * proprietary multi-source value algorithms.
 */

export interface LLLRatingDefinition {
  value: number;
  label: string;
  description: string;
}

export const LLL_RATING_SCALE: Record<number, LLLRatingDefinition> = {
  10: {value: 10, label: 'Franchise', description: 'Cornerstone player, face of the franchise'},
  9: {value: 9, label: 'Top 5', description: 'Elite performer, top 5 at their position'},
  8: {value: 8, label: 'Top 10', description: 'Great starter, top 10 at their position'},
  7: {value: 7, label: 'All-Star', description: 'Key player, Pro-Bowl caliber'},
  6: {value: 6, label: 'Contributor', description: 'Solid contributor, important to team success'},
  5: {value: 5, label: 'Rotational', description: 'Average starter, specialist, or rotational player'},
  4: {value: 4, label: 'Below Avg', description: 'Just below average but still plays'},
  3: {value: 3, label: 'Backup', description: 'Average quality backup'},
  2: {value: 2, label: 'Replaceable', description: 'Backup who could easily be replaced'},
  1: {value: 1, label: 'Roster', description: 'Made the roster or practice squad'},
  0: {value: 0, label: 'Cut', description: 'Released from the team'},
};

export class LLLRatingEngine {
  /**
   * The "Black Box" algorithm.
   * Calculates a score based on draft position vs actual performance ratings.
   *
   * Value = (Performance Rating * Performance Weight) - (Draft Position Expectation * Position Weight)
   */
  static calculateDraftValue(draftSlot: number, performanceRating: number): number {
    // Draft expectation curve (1st pick expected to be 9-10, 32nd pick expected to be 6-7)
    const expectation = this.getExpectedRatingForSlot(draftSlot);
    return performanceRating - expectation;
  }

  private static getExpectedRatingForSlot(slot: number): number {
    if (slot === 1) {return 9.5;}
    if (slot <= 5) {return 8.5;}
    if (slot <= 10) {return 7.5;}
    if (slot <= 32) {return 6.0;}
    return 4.0;
  }

  static getRatingLabel(rating: number): string {
    return LLL_RATING_SCALE[Math.round(rating)]?.label || 'Unknown';
  }

  /**
   * Mock Accuracy: Root Mean Square Error (RMSE)
   * Measures how close an expert's predicted slot was to the actual slot.
   * Lower is better (0 = perfect).
   */
  static calculateRMSE(predictions: {predicted: number; actual: number}[]): number {
    if (predictions.length === 0) {return 0;}
    const sumOfSquares = predictions.reduce((sum, p) => {
      return sum + Math.pow(p.predicted - p.actual, 2);
    }, 0);
    return Math.sqrt(sumOfSquares / predictions.length);
  }

  /**
   * Scouting Accuracy: The "Talent Delta"
   * Compares an expert's pre-draft grade (converted to 0-10) to the LLL Career Rating.
   * Measures if they were "right" about the player's quality.
   */
  static calculateTalentDelta(expertGradeScale: number, lllCareerRating: number): number {
    // 0 = perfect prediction, positive = expert overhyped, negative = expert undervalued
    return expertGradeScale - lllCareerRating;
  }

  /**
   * Maps a Letter Grade (A, B, C...) to our 0-10 scale for comparison.
   */
  static mapLetterGradeToScale(grade: string): number {
    const mapping: Record<string, number> = {
      'A+': 10,
      A: 9.5,
      'A-': 9,
      'B+': 8.5,
      B: 7.5,
      'B-': 7,
      'C+': 6.5,
      C: 5.5,
      'C-': 5,
      'D+': 4,
      D: 3,
      F: 0,
    };
    return mapping[grade.toUpperCase()] || 5;
  }
}

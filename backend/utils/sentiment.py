"""
Sentiment Analysis Utility - keyword-based, no AI cost
Combines text keywords + star rating for accurate hotel review sentiment
"""

POSITIVE_KEYWORDS = {
    'amazing', 'excellent', 'wonderful', 'great', 'fantastic', 'perfect',
    'outstanding', 'love', 'loved', 'best', 'beautiful', 'comfortable',
    'friendly', 'helpful', 'recommend', 'enjoyed', 'pleased', 'satisfied',
    'impressive', 'superb', 'delightful', 'clean', 'spacious', 'cozy',
    'warm', 'professional', 'exceptional', 'magnificent', 'stunning',
    'incredible', 'gorgeous', 'brilliant', 'fabulous', 'splendid',
    'terrific', 'awesome', 'pleasant', 'nice', 'good', 'happy', 'glad',
    'thankful', 'grateful', 'polite', 'attentive', 'efficient', 'immaculate',
    'spotless', 'luxurious', 'premium', 'top', 'superb', 'flawless',
    'perfect', 'charming', 'welcoming', 'hospitable', 'responsive',
    'above', 'exceeded', 'exceeded expectations', 'highly recommend',
    'five stars', '5 stars', 'will return', 'will definitely', 'worth',
    'value', 'reasonable', 'affordable', 'budget', 'bargain',
}

NEGATIVE_KEYWORDS = {
    'terrible', 'awful', 'horrible', 'bad', 'worst', 'disgusting',
    'disappointing', 'disappointed', 'poor', 'mediocre', 'dirty',
    'rude', 'slow', 'unhelpful', 'broken', 'noisy', 'smelly',
    'uncomfortable', 'frustrated', 'frustrating', 'angry', 'overpriced',
    'unacceptable', 'ignored', 'waste', 'filthy', 'unprofessional',
    'careless', 'negligent', 'unclean', 'subpar', 'dreadful',
    'appalling', 'atrocious', 'shocking', 'miserable', 'unpleasant',
    'annoying', 'useless', 'incompetent', 'lazy', 'hostile', 'cold',
    'cramped', 'dated', 'old', 'stained', 'broken', 'moldy',
    'cockroach', 'bug', 'insect', 'pest', 'leak', 'flooded',
    'never again', 'avoid', 'scam', 'rip off', 'ripoff', 'cheated',
    'lied', 'false', 'misleading', 'not worth', 'regret', 'wasted',
    'below average', 'below expectations', 'not recommended',
    'not recommend', 'do not stay', 'stay away',
}

NEUTRAL_KEYWORDS = {
    'okay', 'fine', 'average', 'decent', 'acceptable', 'standard',
    'normal', 'expected', 'alright', 'moderate', 'adequate', 'fair',
    'nothing special', 'as expected', 'typical', 'basic', 'so-so',
}


def compute_sentiment(text: str, rating: int = None) -> str:
    """
    Compute sentiment label from review text and optional star rating.
    Returns one of: 'positive', 'negative', 'neutral', 'mixed'
    """
    if not text:
        # Fall back to rating only
        if rating is not None:
            if rating >= 4:
                return 'positive'
            elif rating <= 2:
                return 'negative'
        return 'neutral'

    words = text.lower()

    # Check multi-word phrases first
    pos_score = sum(1 for kw in POSITIVE_KEYWORDS if kw in words)
    neg_score = sum(1 for kw in NEGATIVE_KEYWORDS if kw in words)

    # Apply star rating bias (weighted 1.5x keyword match)
    if rating is not None:
        if rating >= 4:
            pos_score += 2
        elif rating == 3:
            pass  # neutral, no bias
        elif rating <= 2:
            neg_score += 2

    # Determine sentiment
    if pos_score == 0 and neg_score == 0:
        # No clear signals - use neutral keywords or rating
        neutral_count = sum(1 for kw in NEUTRAL_KEYWORDS if kw in words)
        if neutral_count > 0:
            return 'neutral'
        if rating is not None:
            if rating >= 4:
                return 'positive'
            elif rating <= 2:
                return 'negative'
        return 'neutral'

    # Mixed: meaningful signals on both sides
    if pos_score >= 2 and neg_score >= 1:
        return 'mixed'
    if neg_score >= 2 and pos_score >= 1:
        return 'mixed'

    if pos_score > neg_score:
        return 'positive'
    elif neg_score > pos_score:
        return 'negative'
    else:
        return 'mixed'

"""Twitter augmentation for Kalshi market data."""

import os
import re
import requests
from datetime import datetime, timedelta
from collections import Counter
from urllib.parse import urlparse

# Simple stopword list to keep queries tight and market-relevant
STOPWORDS = {
    'the', 'a', 'an', 'of', 'for', 'and', 'in', 'on', 'to', 'is', 'will', 'at',
    'by', 'with', 'who', 'what', 'when', 'where', 'why', 'how', 'vs', 'or',
    'be', 'are', 'this', 'that', 'from', 'as', 'about', 'into', 'over', 'under',
    'pro', 'next', 'winner', 'win', 'wins', 'won', 'lose', 'loses', 'loss'
}


def build_event_keywords(title_clean, category, series_ticker=None):
    """Keep only meaningful words from a title."""
    tokens = re.findall(r"[A-Za-z0-9']+", title_clean)
    keywords = []
    for token in tokens:
        low = token.lower()
        if len(low) < 3 and not (token.isupper() and 2 <= len(token) <= 4):
            continue
        if low in STOPWORDS:
            continue
        keywords.append(token)
    return keywords[:10]


def augment_kalshi_with_twitter(kalshi_feed_data, x_api_key=None):
    """
    Augment Kalshi market feed data with Twitter metrics.
    
    Args:
        kalshi_feed_data: Dict containing Kalshi feed data
        x_api_key: X API bearer token (or set X_API_KEY env var)
    
    Returns:
        Dict with augmented data
    """
    if x_api_key is None:
        x_api_key = os.environ.get('X_API_KEY')
    
    if not x_api_key:
        print("Warning: No X API key provided. Skipping Twitter augmentation.")
        return {
            'kalshi_feed': kalshi_feed_data,
            'twitter_augmentation': {},
            'metadata': {
                'augmented_at': datetime.utcnow().isoformat() + 'Z',
                'markets_augmented': 0,
                'api_calls_used': 0,
                'error': 'No X API key provided'
            }
        }
    
    augmented_data = {
        'kalshi_feed': kalshi_feed_data,
        'twitter_augmentation': {},
        'metadata': {
            'augmented_at': datetime.utcnow().isoformat() + 'Z',
            'markets_augmented': 0,
            'api_calls_used': 0
        }
    }
    
    # Process each series in the feed
    for series in kalshi_feed_data.get('feed', []):
        series_title = series.get('event_title') or series.get('series_title')
        series_ticker = series.get('series_ticker')
        category = series.get('category', '')
        
        if not series_title:
            continue
        
        print(f"Fetching Twitter data for event: {series_title}...")
        
        # Collect market-specific questions (yes_subtitle) for tighter queries
        market_questions = []
        for market in series.get('markets', []):
            q = market.get('yes_subtitle') or market.get('market_title') or market.get('title')
            if q:
                market_questions.append(q)
        
        # Get Twitter data using market questions (not tickers)
        twitter_data = get_twitter_metrics_for_event(
            event_title=series_title,
            category=category,
            x_api_key=x_api_key,
            market_questions=market_questions
        )
        
        # Store at series level, not individual market level
        augmented_data['twitter_augmentation'][series_ticker] = {
            'event_title': series_title,
            'category': category,
            'twitter_metrics': twitter_data,
            'markets': {}
        }
        
        # Add market-specific info (just the Kalshi data)
        for market in series.get('markets', []):
            ticker = market.get('ticker')
            augmented_data['twitter_augmentation'][series_ticker]['markets'][ticker] = {
                'yes_subtitle': market.get('yes_subtitle'),
                'market_price': market.get('last_price_dollars'),
                'last_price': market.get('last_price'),
                'price_delta': market.get('price_delta')
            }
        
        augmented_data['metadata']['markets_augmented'] += 1
        augmented_data['metadata']['api_calls_used'] += twitter_data.get('_api_calls', 1)
    
    return augmented_data


def get_twitter_metrics_for_event(event_title, category, x_api_key, market_questions=None, series_ticker=None):
    """
    Get Twitter metrics for a specific event using X API.
    
    Args:
        event_title: Title of the event (e.g., "Next US Presidential Election Winner?")
        category: Event category (e.g., "Elections")
        x_api_key: X API bearer token
    
    Returns:
        Dict with Twitter metrics
    """
    # Build search query based on market questions (preferred) or event title
    # Clean up the title (remove question marks, etc.)
    title_clean = event_title.replace('?', '').strip()
    market_questions = market_questions or []
    
    # Build query as OR of up to 4 sub-market questions, each paired with the event title,
    # plus a looser OR of the options and the event title alone (helps avoid empty results)
    cleaned_questions = []
    for q in market_questions:
        q_clean = q.replace('?', '').strip()
        if q_clean:
            cleaned_questions.append(q_clean)
    selected_questions = cleaned_questions[:4]
    keywords = selected_questions if selected_questions else ([title_clean] if title_clean else [])
    
    combined_clauses = []
    if title_clean:
        for q in selected_questions:
            combined_clauses.append(f'"{title_clean}" "{q}"')
        # also include the event title alone as a broad catch
        combined_clauses.append(f'"{title_clean}"')
    else:
        combined_clauses = [f'"{q}"' for q in selected_questions]
    
    # Add a loose OR of the options themselves
    options_or = " OR ".join([f'"{q}"' for q in selected_questions]) if selected_questions else ''
    
    clauses = [c for c in combined_clauses + ([options_or] if options_or else []) if c]
    query_body = " OR ".join(clauses) if clauses else title_clean
    query = f'({query_body}) -is:retweet lang:en'
    fallback_query = None
    print(f"[twitter_augmentation] event='{event_title}' primary='{selected_questions[:1]}' query='{query}' phrases={selected_questions}")
    
    # X API endpoint
    url = "https://api.twitter.com/2/tweets/search/recent"
    
    headers = {
        "Authorization": f"Bearer {x_api_key}",
        "Content-Type": "application/json"
    }
    
    def _run_query(q):
        params = {
            "query": q,
            "max_results": 100,  # Max allowed per request
            "tweet.fields": "created_at,public_metrics,author_id,entities",
            "user.fields": "username,verified,public_metrics",
            "expansions": "author_id"
        }
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        return response.json()
    
    api_calls = 0
    try:
        data = _run_query(query)
        api_calls += 1
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Twitter data: {e}")
        return {
            'error': str(e),
            '_api_calls': api_calls or 1
        }
    
    # Extract tweets and users
    tweets = data.get('data', [])
    users_list = data.get('includes', {}).get('users', [])
    users = {user['id']: user for user in users_list}
    
    # Fallback: if empty and we have options or title, retry with looser OR
    if not tweets and (options_or or title_clean):
        fallback_parts = []
        if title_clean:
            fallback_parts.append(f'"{title_clean}"')
        if options_or:
            fallback_parts.append(options_or)
        if fallback_parts:
            fallback_query = f'({" OR ".join(fallback_parts)}) -is:retweet lang:en'
            print(f"[twitter_augmentation] fallback query='{fallback_query}'")
            try:
                data = _run_query(fallback_query)
                api_calls += 1
                tweets = data.get('data', [])
                users_list = data.get('includes', {}).get('users', [])
                users = {user['id']: user for user in users_list}
            except requests.exceptions.RequestException as e:
                print(f"Error fetching Twitter data (fallback): {e}")
    
    if not tweets:
        return {
            'total_tweets': 0,
            'message': 'No tweets found',
            'search_query': query,
            'fallback_query': fallback_query,
            'relevance_filter_keywords': keywords,
            '_api_calls': api_calls or 1
        }
    
    # Calculate metrics
    now = datetime.utcnow()
    cutoff_24h = now - timedelta(hours=24)
    cutoff_1h = now - timedelta(hours=1)
    
    # Volume metrics
    tweets_last_24h = 0
    tweets_last_1h = 0
    
    # Engagement metrics
    total_likes = 0
    total_retweets = 0
    total_replies = 0
    
    # Influence metrics
    verified_count = 0
    follower_counts = []
    
    # Content metrics
    tweets_with_links = 0
    tweets_with_media = 0
    all_hashtags = []
    url_domains = []
    
    # Track unique authors
    unique_authors = set()
    
    # Collect top tweets for sorting
    tweet_data = []
    
    for tweet in tweets:
        # Parse created_at
        created_at = datetime.strptime(tweet['created_at'], '%Y-%m-%dT%H:%M:%S.%fZ')
        
        # Time-based counts
        if created_at >= cutoff_24h:
            tweets_last_24h += 1
        if created_at >= cutoff_1h:
            tweets_last_1h += 1
        
        # Engagement metrics
        metrics = tweet.get('public_metrics', {})
        likes = metrics.get('like_count', 0)
        retweets = metrics.get('retweet_count', 0)
        replies = metrics.get('reply_count', 0)
        
        total_likes += likes
        total_retweets += retweets
        total_replies += replies
        
        # Calculate engagement score for ranking
        engagement_score = likes + (retweets * 2) + replies
        
        # Author data
        author_id = tweet.get('author_id')
        unique_authors.add(author_id)
        
        author = users.get(author_id, {})
        is_verified = author.get('verified', False)
        author_metrics = author.get('public_metrics', {})
        followers = author_metrics.get('followers_count', 0)
        
        if is_verified:
            verified_count += 1
        
        if followers:
            follower_counts.append(followers)
        
        # Entities
        entities = tweet.get('entities', {})
        
        # Links
        urls = entities.get('urls', [])
        if urls:
            tweets_with_links += 1
            for url_obj in urls:
                expanded = url_obj.get('expanded_url', '')
                if expanded:
                    domain = urlparse(expanded).netloc
                    url_domains.append(domain)
        
        # Media (check if media key exists in entities)
        if 'media' in entities or any('photo' in url.get('expanded_url', '') for url in urls):
            tweets_with_media += 1
        
        # Hashtags
        hashtags = entities.get('hashtags', [])
        tweet_hashtags = [tag.get('tag', '').lower() for tag in hashtags if tag.get('tag')]
        all_hashtags.extend(tweet_hashtags)
        
        # Store tweet for top tweets
        tweet_data.append({
            'id': tweet['id'],
            'text': tweet['text'],
            'author_username': author.get('username', 'unknown'),
            'author_verified': is_verified,
            'author_followers': followers,
            'created_at': tweet['created_at'],
            'hours_ago': (now - created_at).total_seconds() / 3600,
            'hashtags': tweet_hashtags,
            'engagement': {
                'likes': likes,
                'retweets': retweets,
                'replies': replies,
                'total': engagement_score
            },
            'url': f"https://twitter.com/{author.get('username', 'i')}/status/{tweet['id']}"
        })
    
    # Relevance filter: keep tweets mentioning keywords or matching hashtags
    keyword_matchers = {kw.lower() for kw in keywords}
    def _is_relevant(tweet):
        text_lower = tweet['text'].lower()
        if any(kw in text_lower for kw in keyword_matchers):
            return True
        if any(ht in keyword_matchers for ht in tweet.get('hashtags', [])):
            return True
        return False
    
    relevant_tweets = [t for t in tweet_data if _is_relevant(t)]
    relevance_applied = True
    if not relevant_tweets:
        relevant_tweets = tweet_data  # fallback to avoid empty results
        relevance_applied = False
    
    # Sort relevant tweets by engagement with light recency bonus
    def _rank_score(t):
        recency_bonus = max(0, 48 - t['hours_ago']) * 0.5  # favor fresher tweets
        return t['engagement']['total'] + recency_bonus
    
    top_posts = sorted(relevant_tweets, key=_rank_score, reverse=True)[:10]
    
    # Calculate derived metrics
    total_tweets = len(tweets)
    avg_engagement_rate = (total_likes + total_retweets + total_replies) / total_tweets if total_tweets > 0 else 0
    avg_author_followers = sum(follower_counts) / len(follower_counts) if follower_counts else 0
    max_author_followers = max(follower_counts) if follower_counts else 0
    
    # Velocity metrics
    tweet_velocity_24h = tweets_last_24h  # tweets per day (last 24h)
    tweet_velocity_7d = total_tweets / 7  # average per day over 7 days
    velocity_change = ((tweet_velocity_24h - tweet_velocity_7d) / tweet_velocity_7d) if tweet_velocity_7d > 0 else 0
    
    # Top hashtags
    relevant_hashtags = []
    for t in relevant_tweets:
        relevant_hashtags.extend(t.get('hashtags', []))
    hashtag_source = relevant_hashtags if relevant_hashtags else all_hashtags
    hashtag_counts = Counter(hashtag_source)
    top_hashtags = [{'tag': tag, 'count': count} for tag, count in hashtag_counts.most_common(10)]
    
    # News domains (filter for known news sites)
    news_domains = ['nytimes.com', 'wsj.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 
                    'bbc.com', 'reuters.com', 'apnews.com', 'politico.com', 'thehill.com',
                    'bloomberg.com', 'ft.com', 'npr.org']
    domain_counts = Counter(url_domains)
    news_domain_mentions = {
        domain: count for domain, count in domain_counts.items() 
        if any(news in domain for news in news_domains)
    }
    
    # Return all metrics
    return {
        # Volume metrics
        'total_tweets': total_tweets,
        'tweets_last_24h': tweets_last_24h,
        'tweets_last_hour': tweets_last_1h,
        
        # Engagement metrics
        'total_likes': total_likes,
        'total_retweets': total_retweets,
        'total_replies': total_replies,
        'avg_engagement_rate': round(avg_engagement_rate, 3),
        
        # Sentiment (stub for LLM)
        'sentiment_analysis': {
        'status': 'pending_llm_analysis',
            'top_posts_for_analysis': [t['text'] for t in top_posts[:5]],
            'placeholder_score': None  # Will be filled by LLM
        },
        
        # Velocity metrics
        'tweet_velocity_24h': tweet_velocity_24h,
        'tweet_velocity_7d': round(tweet_velocity_7d, 2),
        'velocity_change': round(velocity_change, 3),
        
        # Influence metrics
        'verified_user_tweets': verified_count,
        'avg_author_followers': int(avg_author_followers),
        'max_author_followers': max_author_followers,
        'unique_authors': len(unique_authors),
        
        # Top posts (X)
        'top_posts': top_posts,
        # Back-compat
        'top_tweets': top_posts,
        
        # Content quality
        'tweets_with_links': tweets_with_links,
        'tweets_with_media': tweets_with_media,
        'news_domain_mentions': news_domain_mentions,
        
        # Hashtags
        'top_hashtags': top_hashtags,
        'relevant_tweets_considered': len(relevant_tweets),
        'relevance_filter_applied': relevance_applied,
        'relevance_filter_keywords': keywords,
        
        # Meta
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'search_query': query,
        'fallback_query': fallback_query,
        'api_used': 'search_recent',
        '_api_calls': api_calls
    }

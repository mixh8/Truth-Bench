"""Twitter augmentation for Kalshi market data."""

import os
import requests
from datetime import datetime, timedelta
from collections import Counter
from urllib.parse import urlparse


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
        
        # Get Twitter data ONCE per event (not per market)
        twitter_data = get_twitter_metrics_for_event(series_title, category, x_api_key)
        
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


def get_twitter_metrics_for_event(event_title, category, x_api_key):
    """
    Get Twitter metrics for a specific event using X API.
    
    Args:
        event_title: Title of the event (e.g., "Next US Presidential Election Winner?")
        category: Event category (e.g., "Elections")
        x_api_key: X API bearer token
    
    Returns:
        Dict with Twitter metrics
    """
    # Build search query based on event title and category
    # Clean up the title (remove question marks, etc.)
    title_clean = event_title.replace('?', '').strip()
    
    # Build contextual query
    query = f'"{title_clean}" -is:retweet lang:en'
    
    # Add category-specific keywords if relevant
    if 'election' in category.lower() or 'election' in title_clean.lower():
        query = f'({title_clean} OR election OR vote OR campaign) -is:retweet lang:en'
    elif 'weather' in category.lower() or 'temperature' in title_clean.lower():
        query = f'({title_clean} OR weather OR forecast) -is:retweet lang:en'
    elif 'sports' in category.lower():
        query = f'({title_clean} OR game OR match OR championship) -is:retweet lang:en'
    else:
        # Default: just use the title
        query = f'"{title_clean}" -is:retweet lang:en'
    
    # X API endpoint
    url = "https://api.twitter.com/2/tweets/search/recent"
    
    headers = {
        "Authorization": f"Bearer {x_api_key}",
        "Content-Type": "application/json"
    }
    
    params = {
        "query": query,
        "max_results": 100,  # Max allowed per request
        "tweet.fields": "created_at,public_metrics,author_id,entities",
        "user.fields": "username,verified,public_metrics",
        "expansions": "author_id"
    }
    
    try:
        response = requests.get(url, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error fetching Twitter data: {e}")
        return {
            'error': str(e),
            '_api_calls': 1
        }
    
    # Extract tweets and users
    tweets = data.get('data', [])
    users_list = data.get('includes', {}).get('users', [])
    users = {user['id']: user for user in users_list}
    
    if not tweets:
        return {
            'total_tweets': 0,
            'message': 'No tweets found',
            'search_query': query,
            '_api_calls': 1
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
        for tag in hashtags:
            all_hashtags.append(tag.get('tag', '').lower())
        
        # Store tweet for top tweets
        tweet_data.append({
            'id': tweet['id'],
            'text': tweet['text'],
            'author_username': author.get('username', 'unknown'),
            'author_verified': is_verified,
            'author_followers': followers,
            'created_at': tweet['created_at'],
            'hours_ago': (now - created_at).total_seconds() / 3600,
            'engagement': {
                'likes': likes,
                'retweets': retweets,
                'replies': replies,
                'total': engagement_score
            },
            'url': f"https://twitter.com/{author.get('username', 'i')}/status/{tweet['id']}"
        })
    
    # Sort tweets by engagement and take top 10
    top_tweets = sorted(tweet_data, key=lambda x: x['engagement']['total'], reverse=True)[:10]
    
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
    hashtag_counts = Counter(all_hashtags)
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
            'top_tweets_for_analysis': [t['text'] for t in top_tweets[:5]],
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
        
        # Top tweets
        'top_tweets': top_tweets,
        
        # Content quality
        'tweets_with_links': tweets_with_links,
        'tweets_with_media': tweets_with_media,
        'news_domain_mentions': news_domain_mentions,
        
        # Hashtags
        'top_hashtags': top_hashtags,
        
        # Meta
        'last_updated': datetime.utcnow().isoformat() + 'Z',
        'search_query': query,
        'api_used': 'search_recent',
        '_api_calls': 1
    }


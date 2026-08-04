// === DOM References ===
const searchForm = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const errorMessage = document.getElementById('error-message');

const currentSection = document.getElementById('current-weather-section');
const forecastSection = document.getElementById('forecast-section');
const cityNameEl = document.getElementById('city-name');
const temperatureEl = document.getElementById('temperature');
const conditionEl = document.getElementById('condition');
const windSpeedEl = document.getElementById('wind-speed');
const forecastGrid = document.getElementById('forecast-grid');

// === Constants ===
const STORAGE_KEY = 'weather_dashboard_last_city';
const REQUEST_TIMEOUT_MS = 8000; // 8 seconds

// === WMO Weather Code Map ===
const weatherCodes = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
  85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail'
};

function getWeatherDescription(code) {
  return weatherCodes[code] || 'Unknown condition';
}

// === Loading State ===
function setLoading(isLoading) {
  const submitBtn = searchForm.querySelector('button[type="submit"]');
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Loading...' : 'Search';
  cityInput.disabled = isLoading;
  searchForm.setAttribute('aria-busy', isLoading ? 'true' : 'false');
}

// === Network Helper ===
async function fetchWithTimeout(resource, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    if (error.name === 'AbortError') {
      throw new Error('Request timed out. The server is taking too long to respond.');
    }
    throw error; // Re-throw network errors (offline, DNS, etc.)
  }
}

// === API Functions ===

async function fetchCoordinates(city) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (networkError) {
    throw new Error(networkError.message === 'Failed to fetch' 
      ? 'Network error. Please check your internet connection.' 
      : networkError.message);
  }
  
  if (!response.ok) {
    throw new Error(`Geocoding failed: ${response.status}`);
  }
  
  const data = await response.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('City not found. Please check the spelling.');
  }
  
  return data.results[0];
}

async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=6`;
  
  let response;
  try {
    response = await fetchWithTimeout(url);
  } catch (networkError) {
    throw new Error(networkError.message === 'Failed to fetch'
      ? 'Network error. Please check your internet connection.'
      : networkError.message);
  }
  
  if (!response.ok) {
    throw new Error(`Weather API failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.current || !data.daily || !data.daily.time) {
    throw new Error('Received unexpected data from the weather service.');
  }
  
  return data;
}

// === Rendering Functions ===

function formatDay(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function renderCurrentWeather(location, current) {
  cityNameEl.textContent = location.name;
  temperatureEl.textContent = `${Math.round(current.temperature_2m)}°C`;
  conditionEl.textContent = getWeatherDescription(current.weather_code);
  windSpeedEl.textContent = current.wind_speed_10m;
  
  currentSection.removeAttribute('hidden');
  cityNameEl.focus();
}

function renderForecast(daily) {
  forecastGrid.innerHTML = '';
  const daysToShow = Math.min(daily.time.length, 6);
  
  for (let i = 1; i < daysToShow; i++) {
    const card = document.createElement('div');
    card.className = 'forecast-card';
    
    const dayName = formatDay(daily.time[i]);
    const maxTemp = Math.round(daily.temperature_2m_max[i]);
    const minTemp = Math.round(daily.temperature_2m_min[i]);
    const code = daily.weather_code[i];
    
    card.innerHTML = `
      <p class="day">${dayName}</p>
      <p class="temp">${maxTemp}° / ${minTemp}°</p>
      <p class="cond">${getWeatherDescription(code)}</p>
    `;
    
    forecastGrid.appendChild(card);
  }
  
  forecastSection.removeAttribute('hidden');
}

// === localStorage Functions ===

function saveLastCity(city) {
  try {
    localStorage.setItem(STORAGE_KEY, city);
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}

function getLastCity() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Could not read from localStorage:', e);
    return null;
  }
}

// === Main Handler ===

async function handleSearch(event) {
  if (event) event.preventDefault();
  
  const city = cityInput.value.trim();
  if (!city) return;
  
  errorMessage.textContent = '';
  setLoading(true);
  
  try {
    const location = await fetchCoordinates(city);
    const weatherData = await fetchWeather(location.latitude, location.longitude);
    
    renderCurrentWeather(location, weatherData.current);
    renderForecast(weatherData.daily);
    saveLastCity(city);
    
  } catch (error) {
    console.error(error);
    errorMessage.textContent = error.message;
    
    currentSection.setAttribute('hidden', '');
    forecastSection.setAttribute('hidden', '');
  } finally {
    setLoading(false);
  }
}

// === Initialization ===

function init() {
  const lastCity = getLastCity();
  if (lastCity) {
    cityInput.value = lastCity;
    handleSearch();
  }
}

// === Event Listeners ===
searchForm.addEventListener('submit', handleSearch);

init();
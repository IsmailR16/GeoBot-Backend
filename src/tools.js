export async function getCurrentWeather({ location }, env) {
    try {
        const apiKey = env.WEATHER_API_KEY;
        const apiUrl = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;

        const response = await fetch(apiUrl);
        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        
        // Process 3-day forecast
        const forecast = processForecast(data);
        return JSON.stringify(forecast);

    } catch (error) {
        console.error('Weather error:', error);
        return JSON.stringify({ error: `Couldn't get forecast for ${location}` });
    }
}

function processForecast(data) {
    const dailyForecasts = {};
    
    // Group forecasts by date
    data.list.forEach(item => {
        const date = new Date(item.dt * 1000).toISOString().split('T')[0];
        if (!dailyForecasts[date]) {
            dailyForecasts[date] = {
                date,
                temps: [],
                conditions: [],
                humidity: [],
                wind_speeds: []
            };
        }
        
        dailyForecasts[date].temps.push(item.main.temp);
        dailyForecasts[date].conditions.push(item.weather[0].main);
        dailyForecasts[date].humidity.push(item.main.humidity);
        dailyForecasts[date].wind_speeds.push(item.wind.speed);
    });

    // Create 3-day forecast summary
    const next3Days = Object.values(dailyForecasts)
        .slice(0, 3)
        .map(day => ({
            date: day.date,
            temperature: {
                high: Math.round(Math.max(...day.temps)),
                low: Math.round(Math.min(...day.temps)),
                average: Math.round(day.temps.reduce((a, b) => a + b, 0) / day.temps.length)
            },
            most_common_condition: mode(day.conditions),
            average_humidity: Math.round(day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length),
            average_wind_speed: parseFloat((day.wind_speeds.reduce((a, b) => a + b, 0) / day.wind_speeds.length).toFixed(1))
        }));

    return {
        location: data.city.name,
        country: data.city.country,
        forecast: next3Days
    };
}

// Helper function to find most common condition
function mode(array) {
    return array.sort((a, b) =>
        array.filter(v => v === a).length -
        array.filter(v => v === b).length
    ).pop();
}

export async function getLocation(userIP, env) {
    try {
        const apiKey = env.IP_API_KEY;
        const response = await fetch(`https://ipinfo.io/${userIP}/json?token=${apiKey}`)
        const text = await response.json()
        return JSON.stringify(text)
      } catch (err) {
        console.log(err)
      }
}

export const tools = [
    {
        type: "function",
        function: {
            name: "getCurrentWeather",
            description: "Get the current weather",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The location from where to get the weather"
                    }
                },
                required: ["location"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "getLocation",
            description: "Get the user's current location",
            parameters: {
                type: "object",
                properties: {}
            }
        }
    },
]
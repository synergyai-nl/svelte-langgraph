from django.db import models


class Locality(models.Model):
    name = models.CharField(max_length=255)

    WeatherType = models.TextChoices("sunny", "cloudy", "rainy")
    typical_weather = models.CharField(blank=True, choices=WeatherType, max_length=10)

    def get_weather(self):
        return self.typical_weather

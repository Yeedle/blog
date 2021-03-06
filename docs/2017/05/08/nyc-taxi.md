---
title: "NYC's Taxi Flow"
author: "Yeedle"
date: "2017-05-08"
locale: "en-US"
dateFormat: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
categories: [NYC, taxi, R, tidyverse, sf, tweenr, fuzzyjoin, ggplot2, gganimate, dplyr, tidyr]
excerpt: "Visualizing the flow of NYC's yellow cab system."
---

This is an iteration of something I did last summer when I had the incredible experience of attending the [Microsoft Reserch Data Science Summer School](https://ds3.research.microsoft.com/) (DS3). For my team's [presentation](https://www.microsoft.com/en-us/research/video/data-science-summer-school-2016-fare-share-flow-and-efficiency-in-nycs-taxi-system/), we wanted to include a kind-of [Hans Rosling moment](https://www.youtube.com/watch?v=jbkSRLYSojo), where one of us gets to talk animatedly over an animated visualization of the flow of NYC's taxi system, explaining the flow as the animation plays. The result of our efforts looked like this ([code here](https://github.com/msr-ds3/nyctaxi/blob/master/flow/flow_analysis.R)):

![old gif](https://github.com/msr-ds3/nyctaxi/blob/master/figures/weekdays_cumsum_flow.gif?raw=true)

It was kind of a last minute thing, and I've always wanted to go back and redo it. Since last summer, the tidyverse has made a lot of progress, specifically in the area of spatial data with the appearence of `sf`, a tidy package for spatial data manipulation, and I decided to redo it using [`sf`](https://github.com/edzer/sfr), combined with [`tweenr`](https://github.com/thomasp85/tweenr), a package I discovered earlier this year which lets you create smoother animations, and other tidy tools.


The data I used is freely available on the [TLC's website](http://www.nyc.gov/html/tlc/html/about/trip_record_data.shtml). I chose to only work with the last 6 months of 2016, since the RAM on my laptop couldn't handle more. Another cool thing that happened since last summer is that the TLC released a shapefile of the official taxi zones. So while the original animation relied on an "unofficial" source for NYC neighborhood boundaries, I now had the ability to use the TLC's own shapefile.

### How To
The first step is, of course, downloading the data. You can do this by pointing and clicking at the above link, or by writing a shell script. Personally, I like when everything happens inside R, so here's how I did that (using the recently released `glue` package for string interpolation): 


```r
library(tidyverse)
library(glue)

data <- glue("https://s3.amazonaws.com/nyc-tlc/trip+data/yellow_tripdata_{year}-{month}.csv",
             year = "2016",
             month = c("07", "08", "09", "10", "11", "12")) %>%
  map_df(possibly(read_csv, otherwise = data_frame())) %>% 
  select(pickup_datetime = tpep_pickup_datetime,
         dropoff_datetime = tpep_dropoff_datetime,
         passenger_count,
         pickup_zone_id = PULocationID,
         dropoff_zone_id = DOLocationID) %>%
  drop_na()
```

Here's what's happening line-by-line: Using `glue`, I created a list of file URLs. I then `map`ped the list to `possibly(read_csv)` which does the heavy lifting of downloading the files, reading them into R as dataframes, and reducing everything to one big dataframe. Why only `possibly` you ask? The Internet is weird. Don't leave the fate of your downloads in its hands. `possibly` gives you the option of specifying an `otherwise` option in case of failure. In our case, an empty data frame works fine in case of failure.


Since these files are quite big, this step takes a while. Since most of the dataframe is not needed and it's just wasting the computer's memory, I `select` the 5 columns needed for the animation, and drop all the rows with `NA` fields in them.

The next step is getting the shapefile with the neighborhood information. Again, you can do this by pointing and clicking on the TLC's website. I prefer having R doing it for me:

```r
library(curl)

temp <- paste0(tempdir(), "/taxi_zones.zip")
curl_download("https://s3.amazonaws.com/nyc-tlc/misc/taxi_zones.zip",temp)
taxi_shapefile_path <- paste0(tempdir(), "/taxi_zones")
unzip(temp, exdir = taxi_shapefile_path)
unlink(temp)
```

That's it. The shapefile are now downloaded and unzipped and sitting in the temporary directory.


```r
library(sf)
```



```
## Linking to GEOS 3.5.0, GDAL 2.1.0, proj.4 4.9.2
```



```r
library(magrittr)

quietly(st_read)(taxi_shapefile_path, "taxi_zones") %>%
  extract2("result") %>%
  ggplot() + 
  geom_sf(aes(fill = borough)) +
  theme_minimal()
```

![plot_of_taxi_zones](https://github.com/Yeedle/yeedle.github.io/blob/old/figure/source/2017-05-08-NYC-taxi-flow/read_shapefiles-1.png?raw=true)

Cool! Unfortunately, as you might discern from the map, the taxi zones defined for some neighborhoods are a bit too granular for what I want. I used the [`fuzzyjoin`](https://github.com/dgrtwo/fuzzyjoin) package to combine the taxi zones into bigger neighborhoods, leaving the polygon dissolving to `sf`.


```r
library(fuzzyjoin)

neighborhoods <- data_frame(
  zone = c(
    "Battery Park", "Clinton", "Crown Heights", "Chelsea", "Harlem", 
    "Financial District|World Trade Center", "Greenwich Village", 
    "Lenox Hill", "Lincoln Square", "Midtown", "Turtle Bay", "Williamsburg", 
    "Upper East Side", "Upper West Side", "West Village","SoHo|Hudson Sq",
    "Washington Heights", "Yorkville"  
  )
)

zones <- quietly(st_read)(taxi_shapefile_path, "taxi_zones") %>%
  extract2("result") %>%
  st_set_precision(4) %>% 
  regex_left_join(neighborhoods, by = "zone") %>% 
  mutate(zone = if_else(!is.na(zone.y), zone.y, as.character(zone.x))) %>%
  select(LocationID, zone, borough, geometry)
```
This creates an `sf` object, which we'll use for plotting NYC's map. But for now, we don't need the `sf` attributes, and since dataframe operations are faster, I ceated a dataframe with the same information as in `zones` minus the `geometry` list column.


```r
zone_df <- zones %>% as_tibble() %>% select(-geometry)
```

This is all we need to add the location names to the `data` dataframe:


```r
data <- data %>% 
  left_join(zone_df, by = c("pickup_zone_id"="LocationID")) %>%
  rename(pickup_zone = zone) %>%
  left_join(zone_df, by = c("dropoff_zone_id"="LocationID")) %>%
  rename(dropoff_zone = zone)
```

Ok, with all the prelimenary data setup out of the way, it's time to do the actual work. One way to capture the concept of the flow of people in a city, is to measure the difference of people who entered a given neighborhood and people who left it at a given time. This gives us a "flow score" for that particular neighborhood at that point in time. This is similar to how flow in a network is measured, and it's a rough measure of how people move about the city using yellow cabs. This is particularly useful for visulizaiton purposes, where we can map a color palette to the range of 'flow' values over all the neighborhoods.

Since getting a moment-to-moment flow score is not very useful (because not much change happens at any given moment in most of NYC neighborhoods), it's more useful to compute a neighborhood's flow score at the beginiing of each hour of the day, and then interpolate the scores between the hour. In our data, which stretches over a 6 month period, we can calculate the score for every day at every hour, and then take the average. 

There was only one problem with this approach. Some neighborhoods, at certain times in the day, have zero taxi cabs visiting them. To ensure that the average also takes into account the times when nothing happened, I created an empty dataframe, which I then joined with the original dataframe, to fill in the missing hours and days.


```r
library(lubridate)

empty_data <-  zone_df %>%
  distinct(zone) %>%
  mutate(month = map(zone, ~tibble(month = rep(7:12)))) %>%
  unnest() %>%
  mutate(days_in_month = days_in_month(month),
         days_and_hours = map(days_in_month,
                              ~tibble(day_in_month = rep(1:.x, each = 24),
                                      hour_of_day = rep(0:23, .x)))) %>%
  unnest() %>%
  mutate(date = make_date(year = 2016, month = month, day = day_in_month)) %>%
  select(-days_in_month, -day_in_month, -month)

head(empty_data)
```



```
## # A tibble: 6 × 3
##             zone hour_of_day       date
##              chr         int       date
## 1 Newark Airport           0 2016-07-01
## 2 Newark Airport           1 2016-07-01
## 3 Newark Airport           2 2016-07-01
## 4 Newark Airport           3 2016-07-01
## 5 Newark Airport           4 2016-07-01
## 6 Newark Airport           5 2016-07-01
```

With the `empty_data` dataframe ready, the flow scores can be calculated:

```r
data <- data %>%
  mutate(hour_of_day = hour(pickup_datetime),
         date = as_date(pickup_datetime)) %>%
  gather(type, zone, pickup_zone, dropoff_zone) %>%
  mutate(count = if_else(type == "pickup_zone", -passenger_count, passenger_count)) %>%
  group_by(zone, date, hour_of_day) %>%
  summarize(total = sum(count)) %>%
  right_join(empty_data, by = c("zone", "date", "hour_of_day")) %>%
  replace_na(list(total = 0)) %>%
  group_by(zone, hour_of_day) %>%
  summarize(log_avg = log10(abs(mean(total)) + 1) * sign(mean(total))) 

head(data)
```



```
## # A tibble: 6 × 3
## # Groups: zone [1]
##                      zone hour_of_day   log_avg
##               &lt;chr &gt;      &lt;int&gt;     &lt;dbl&gt;
## 1 Allerton/Pelham Gardens           0 0.5317565
## 2 Allerton/Pelham Gardens           1 0.4072800
## 3 Allerton/Pelham Gardens           2 0.3815859
## 4 Allerton/Pelham Gardens           3 0.3010300
## 5 Allerton/Pelham Gardens           4 0.2602270
## 6 Allerton/Pelham Gardens           5 0.1365827
```

This now gives us a dataframe with 24 rows per neighborhood, a row for each hour in the day, and for each neighborhood, for each hour, the log average "flow score." This is enoguh to make the animation at the top of this post. But for the redo, I wanted something more smooth. This is where `tweenr` comes in. `tweenr` is a wonderful package that allows to interpolate data for smoother animation. 


```r
library(tweenr)

data_tweened <- data %>% 
  bind_rows(filter(data, hour_of_day == 0) %>% mutate(hour_of_day = 24)) %>%
  arrange(zone, hour_of_day) %>%
  mutate(ease = "linear") %>% 
  tween_elements('hour_of_day','zone','ease', nframes = 24*10) %>%
  left_join(zones %>% group_by(zone) %>% summarise(), by = c(".group" = "zone")) %>%
  mutate(frame = as_factor(paste0(ifelse(as.integer(hour_of_day)%%12 == 0, '12', as.integer(hour_of_day)%%12), 
                        ":", 
                        ifelse(((hour_of_day-as.integer(hour_of_day))*60) < 10, "0", ""), 
                        round((hour_of_day-as.integer(hour_of_day))*60),
                        ifelse(as.integer(hour_of_day) < 12 | as.integer(hour_of_day) == 24, " AM"," PM"))))
```



```
## Warning: Column `.group`/`zone` joining factor and character vector,
## coercing into character vector
```



```r
head(data_tweened)
```



```
##   hour_of_day   log_avg .frame                  .group
## 1           0 0.5317565      0 Allerton/Pelham Gardens
## 2           0 1.8532484      0           Alphabet City
## 3           0 0.1080942      0           Arden Heights
## 4           0 0.2166248      0 Arrochar/Fort Wadsworth
## 5           0 2.3311962      0                 Astoria
## 6           0 0.2362414      0            Astoria Park
##                         geometry    frame
## 1 POLYGON((1026308.75 256767.... 12:00 AM
## 2 POLYGON((992073.5 203714, 9... 12:00 AM
## 3 POLYGON((935843.25 144283.2... 12:00 AM
## 4 POLYGON((966568.75 158679.7... 12:00 AM
## 5 POLYGON((1010804.25 218919.... 12:00 AM
## 6 POLYGON((1005482.25 221686.... 12:00 AM
```

Here's what happened in this chunk of code: in the first line I re-added hour 0 to the dataframe as hour 24 so that the animation is continously smoothed. Next the data is `arrange`d for each neighborhood in order of the hours. Then a column specifying the easing function to be used by `tweener` is added to the dataframe. I wanted a realistic look, so I went for "linear." Then, `tween_elements` takes the dataframe, and interpolates the data as specified in the argumennts. I specified 240 frame, 10 for each hour, figuring that would give me a smooth enough animation yet not a too large file.

Once the data is tweened, it is handed off to `left_join` where it is rejoined with the `sf` object "`zone`" created earlier. Note that `zone` is grouped by zone and then summarize. This is to dissolve the multiple taxi zone polygons that compose one neighborhood, as specified in the neighborhood dataframe we `left_join`ed earlier. Finally, a new column called `frame` is added to the dataframe, in which the meaningless interpolated `hour_of_day` column is turned into meaninful time stamps. And now, showtime:

```r
library(gganimate)

plot <- ggplot(data_tweened , aes(fill = log_avg, frame = frame)) +
  geom_sf() +
  scale_fill_distiller(palette = "RdBu", na.value = "#808080", guide = "legend",
                       name = "average # of people",
                       breaks = c(3, 2, 1, 0, -1, -2,  -3),
                       labels = c(1000, 100, 10, 0, -10, -100, -1000)) +
  theme_ipsum()+
  theme(axis.text = element_blank(),
        axis.ticks = element_blank(),
        axis.title = element_blank(),
        panel.background = element_blank()) +
  labs(title = "Time: ", caption = "Average daily flow of people using the NYC Taxi system")


gganimate(plot, ani.width = 960, ani.height = 960, interval = .05, "taxi.gif")
```
![new animation](https://github.com/yeedle/yeedle.github.io/blob/old/figure/source/2016-09-11-NYC-taxi-flow/taxi.gif?raw=true)

Voilà!

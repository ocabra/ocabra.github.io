# description

calorie and macro nutrient counting app that will receive
food + quantity (in grams) and display the data in the
website and calculate the calories and macro nutrients.

This data will have different display options, such as tabular
and graphs

# app design

the website will run on github pages.

at first, everything should be as simple as possible.

The flow will be: In a conversation with claude about a meal
claude should use a table to convert from quantity + food into calories
and macro nutrients (carbohydrates, proteins, and fats) and fiber, then
update the db.csv (notice this is a csv) in github and push to the github repository.

json will be the lingua franca for input from the claude code.

so we have:

backend
-------
- TODO: works under claude conversation and I will resolve this later;

frontend
--------
- view.js
- db.csv

Create the schema for claude web to add to db.csv (maybe SCHEMA.md)?

# frontend design

at first, we should have two views of the data, the tabular view
that displays every meal and the weekly view (running week bar plot view in which
there will be a horizontal line with a goal and there will be a bar plot
for each macronutrient and for calories).

we should have tabs for clicking and going to each view.

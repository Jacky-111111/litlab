# Reflection

## Describe your process. At a high level, how did you go about creating this project?
Overall everything went well. It took me some time to come up with the project idea and to understand the Supabase configuration (which turned out to be really useful). The website dev went smoothly thanks to the experience we gained throughout the semester. I intentionally made the app just a simpler version of the website because I knew that duplicating every feature in the app would have taken much more time.

## What AI tools and strategies did you use? What models did you choose, and were you using them in a browser chat, in something like Cursor, in the command line, etc? Did you use an agentic process like in HW8, or something else?
I discussed the ideas for this project with ChatGPT 5.4 in a browser chat and had it generate a SPEC-like prompt for Cursor to start building. It encountered some problems when trying to build the whole website at once, so I took some time to debug and carefully add new features later on. After I was satisfied with the running web platform, I asked Cursor to generate a complete SPEC that guides another agent to build a mobile version of the website with essential features using EXPO, which went smoothly.

## Why did you make the choices above?
From my last App-dev HW, I learned that it's difficult to build everything (frontend, backend, database, APIs, etc.) from scratch in an Expo project. So this time, I started by building a working website with everything configured and the UI determined, then built the app based on the website. I'm glad it went well.

## What changed from your pre-113 approach? Compare your approach to how you might have approached the project before 15-113. What has changed, if anything? Do you feel more or less well-equipped to create projects like this within a reasonable time frame?
Pre 15-113, I might have struggled with selecting the right tools and tech stack to build a cross-platform application for people to use, and even with AI, the process of creating both a website and a mobile app would have taken much more time. Now, I understand how to harness LLMs and AI tools more effectively, and by using the agentic tricks and choosing the right tools, I feel much more equipped to create projects like this quickly.

## What might you do with this project with more time?
I would add more features, such as better support for real-time paper searching across different sources. Currently, the project is limited by API call restrictions from Semantic Scholar. Additionally, I would develop a Google Chrome extension platform that allows users to login using the same account and save papers found online faster.
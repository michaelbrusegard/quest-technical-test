# Quest technical test


## Task description

Build a conversational agent that knows something unique about you.
Pick one data source that would reveal something about you. The agent must ground its knowledge from it, maintain a memory layer that extracts meaningful information from that data, and interact through a conversational interface (terminal or dedicated UI).
There is no single right answer. Feel free to use any method to access the data, it doesn't have to come from an API.

## Picking the data source

When choosing the data source I wanted a source that would be generic enough that it could be useful for anybody and also not a source that had a bunch of different providers so I would need a custom integration for many different platforms. In other words I wanted to be able to put the product in front of a stranger and it would immediately be useful.

Initially I asked ChatGPT for suggestions, but none of them fit my requirement. It suggested things like git history (which only would be useful for developers), calendar (which not everybody uses and has limited usefulness alone) or message history (which has many providers to pick from). Eventually I started searching the web, when I realised that everybody searches the web. Why not use the browser history as my data source? So that is what I ended up with.

## Platform

To access the browser history I need to pick a platform where I can read it, so something on the desktop. A website would be easy to implement, but there are strict boundaries for accessing I/O which would require workarounds and user interaction (so not user friendly). A terminal UI would be cool, but then again I want a random stranger to be able to use this. A desktop application would be ideal, it can access I/O and read browser history without user input, and I can still use web technologies to develop it through frameworks like electron or tauri. I picked tauri as my framework of choice mostly because I have used it before so I can save some time, but it also has the benefit of a smaller bundle and less memory consumption.

## Tech stack

For the tech stack I wanted to pick libraries I am familiar with and libraries that I can work fast with using LLMs. The reason is that I want to spend most of my time focusing on the "memory" layer where most of the uncertanity lies for me since that is what I have the least experience with.

With this in mind I ended up with the following baseline:
- React (Good for LLMs)
- Tanstack (picking what I need here)
- Vite (oxfmt, oxlint)
- Rust (Tauri)

For the UI I went with tailwindcss and shadcn/ui since LLMs are good with it. I also use assistant/ui which is built around react and shadcn/ui to quickly get a UI up and running.

For the memory I did research many prebuilt solutions like OpenViking and Langchain, but based on the limited research I did I felt that they didn't quite fit the technical test. This is mostly because I think they may abstract away a lot of interesting solutions and would fit better into a more complex architecture.

Instead I opted for sqlite for the memory (which is also partially what you are doing in the sandboxes), with the Drizzle ORM, since I have used it before and I think it is the best Typescript ORM currently (even though it is beta).

For accessing the LLMs I choose to use the Vercel AI SDK because it simplifies the streaming. I didn't want it to go through the Rust backend which made me have to deal with CORS instead :(.

## Scope

To scope the project the goal is to first create an MVP, then improve the memory layer and lastly add new features. Originally the plan was to only support a single browser provider, but adding more providers seemed easier than expected using agents.

MVP:
- [x] Fetch browser data into a standardised format in Rust
- [x] Basic chat frontend
- [x] Create basic memory layer exposing tools to the agent

Memory layer improvements:
- [x] Use a fast model from Cerebras to enrich the memory by soritng into sessions

Here I noticed I could use the agent inside of the app itself to help improve the memory, by asking it how it felt the tool calls worked and what it would actually expect

Extra features
- [] Automatically suggest prompts based on recent history
- [] Add a custom UI for the tool calls
- [] Add settings for excluding browsers or browser profiles
- [] Add persistance
- [] Add a sidebar with multiple chats (like ChatGPT etc)

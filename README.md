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

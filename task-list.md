# task list

- at ingstion time, eliminate url parsing from markdown, we agree that all ingested documents must be properly formed markdown with abstract etc... 
- define a standard markdown format for ingestion
- make sure markdown to be ingested contains all metadata fields needed for SQL search (identifiers, actors, dates) and vector search (title, abstract, content,etc...)
- for patents include all relevant identifiers e.g. WOxxx | USxxx | TWxxx | ... (so really we are identifying a patent family). Although we need primary to be identified to provide simple priority / expiration dates, the other identifiers for reference.
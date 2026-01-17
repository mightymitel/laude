Overview of the project

Laudasist - your worship assistant
An app to help churches and worship leaders manage worship services

Core functionality:
- song database: 
    - search by name, author, tags, lyrics (across versions)
    - should be able to store different versions and translations, but favorite one
    - should be able to link songs that work well together
    - should be able to create playlists
    - should store chords and favorite key for each song: 
        - for easy transpose we can store the chords as number (the chord index in the current key)
        - to position the chords we can store the song with chords inside with square brackets before the exact syllable it should be placed on top of.
        - for this, each line of the song should start with 2 white spaces, so we can have chords there, before the song starts.
    - we will have an official song library, a community song library, a church song library, and a user song library. 
        - All users can add their own songs and can share them with the community. 
        - An official admin can add songs to the official song library. 
        - A church admin can add songs to the church song library. 
        - A user can add songs to their own user song library, and can share them with the community (to be added in the community library) and can propose it to the official library
    - user and church owned songs can be private or public.
    - we can have a song composite that is a mix of different song parts
    - each song has parts: verses, chorus, bridge, etc.
    - each song will have multiple arrangments - order in which the parts should be played. eg. (V1 V2 C1 C1 V3 C1 B1 B1 C1) with one default arrangment.
    - each song can have multiple tags: (worship, dedication, blood, holy spirit, joy, christmas, battle, counrty, etc.)
    - a user can clone a song in it own library and can modify it.
- users database and roles:
    - users can have different roles: 
        - user
        - church admin
        - church owner
        - church staff
        - official admin
        - community moderator
    - a user can subscribe to multiple churches.
    - a user can hold multiple roles
- service:
    - a service is listed only to the admins and church staff, but can be accesed by anyone using a temporary generated link / qr code, with different links for view and edit. links can be revoked if needed. View links can be accesed by guests as well, but edit only works with a logged in user.
    - a service has 3 mode: edit, live and archived
    - a service contains a playlist
    - in a service playlist, each song can be set to a specific key, and can have some comments.
    - a service playlist is ordered
    - a service can have a bible playlist - to access some bible passages quickly
    - a service will have a main theme
    - a service will define the types of viewports that it will broadcast
    - a user and a church will have predefined viewports that it can apply quickly.
- viewport:
    - a viewport is a broadcasted view of a service
    - there will be default viewports: audience, stage, instrument, phone, subtitles.
    - for now viewports are basicly webpages, but in the future we may have a video broadcast viewport as well.
    - a viewport can have a specific theme - font, color, default background, and enable or disable song background
    - a viewport can have a specific layout: elements position, sizes etc.
    - a background can be a solid color, an image or a video
    - a viewport can be set to user-defined: the service editor can set what data will be sent, but the layout and theme will be defined by the user accesing the viewport from it's user dashboard.

- Presenter Dashboard:
    - special viewport for the presenter
    - complex dashboard, to be used when a service is live
    - column with the service playlist, service bible playlist and quick search in the libraries, in order: first favorites, then church library, then official library, then community library
    - column for content - preview
    - column for content - live
    - column for viewports preview
    - in the content columns the presenter can make changes to the content, add slides etc.
    - in the viewports columns, the presenter can make changes to a specific vieport - change theme, layout, background etc.
    - there should be also the option for the presenter to add an entire new song.
- functionality and flow:
    - a user can login with google, facebook, apple, or email
    - a user can create a church
    - a user will have it's own dashboard with recenly played, saved playlists, services, church news, library etc.
    - user can create services
    - a user can create, edit, delete a song from it's own library
    - a user can share a song in it's library to be listed in the community library
    - a user can propose a song to be added to the official library
    - a user can propose a song to be added to the church library
    - a church admin or staff can add songs to the church song library (from existing libraries or new song), and can edit or delete songs from the church song library.
    - a church admin or staff can create church services.
    - a normal user can also create a service.
    - *Core Functionality: LIVE SERVICE*
        - a service, after it has been prepared can be set to live
        - when a service is live, all the viewports will be broadcasted, and the presenter dashboard will be opened
        - links will be generated to access the broadcasts
        - the presenter can choose a song or a bible verse(from the playlist or libraries) and will appear in the preview column, then he can commit it to the live column, and it will be broadcasted to the viewports.
        - the song or the bible verses will be split in parts, with one part shown at a time as a slide, and the presenter can navigate between the slides.
        - if a song is commited to live, presenter can navigate between the verses in the live directly, trough arrows or click on the part to be shown.
        - during service, presenter can edit or add new slides in the preview column and commit them to live.
        - when the current live slide is selected, all the viewports should update.
    - Fast Service 
        - quick start, directly in live mode, with no viewport, but with option to start one.
        - no preview, when a song is selected it goes live directly
        - it will have just 2 columns: song search and live
        - in the live as well as in the default viewport you can choose to show chords or not, transpose, chord style etc.


Clarifying question answered:
    1. Tech stack - Typescript:
        - Node backend using express, socket.io 
        - Next frontend, css modules, no tailwind, storybook, jest
        - Tanstack query for data fetching, caching and store
        - Firebase deployment, authentication, storage
        - MongoDB
        I've added firebase mcp server. Created laudasist-45900287 project.
    
    2. Complex chords can be stored as such:
        - base will be the index in current key
        - by default 1, 4 and 5 are majors and 2, 3 and 6 are minors, we will need a modifier if it's not the default
        - b to flat
        - # to sharp
        - qualities added for example: sus4, dim7, aug5
        - slash chords as slash chords
        - examples: [1maj7, b2, 1sus4, 3maj, 3, 1/5]
        - the user will be able to write the chords in a standard way, and the system will convert it to the internal format. For example in the key of C: [Am, Em, F, G7, E, C] will become [6, 3, 4, 5maj7, 3maj, 1]
    2b. When moving a song from a library to another it will always be cloned, so there will be completely separate copies of the song in each library. But a link to the song in the original library will be saved. Each song will have it's own version number.

    3. Each library will have it's own versions of the songs, but a check for update option should be available for each song or for the whole library, that will check for updates in the original library and update the song if needed, as long as it doesn't have local changes of lyrics or chords.

    4. The song data is separated between content, metadata and options. Content is the lyrics and chords, metadata is the title, author, copyright, etc. Options are the settings for the song, like key, tempo, arrangements etc. When cloning a song the user should be able to choose if to clone the options or not.

    5. Church subscription is just an association to load and list a certain churches libraries, services and news.

    6. Both user and church libraries are default private but can be made public, but as public, the options will be hidden.

    7. The viewport video broadcast will be a video output generated by us to be used as a video source for a broadcast software like OBS.

    8. Multiple staff should be able to control a live service at the same time

    9. Bible integration: we will start by using API.Bible, with KJV and Romanian Dumitru Cornilescu versions, but later we will have our own copies of all the bible translations we need.

    10. MVP:
        - Phase 1: Auth, User Dashboard, Personal Song Library, song creation, song search, 
        - Phase 2: User Fast Service without viewports, only local view.
        - Phase 3: default viewports, official an community libraries
        - Phase 4: church dashboard, church services, church library, church subscription
        - Phase 5: Church Live Service - basic functionality
        - Phase 6: Bible Integration, Bible search, Bible playlist


User dashboard will have a big start playing button that will start a fast service in local view.
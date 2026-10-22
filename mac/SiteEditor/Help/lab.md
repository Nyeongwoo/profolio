# The Lab

The Lab holds the site's interactive pieces — small web pages (HTML, CSS, JavaScript) under public/lab/<name>/ that site pages can embed with an Interactive section.

- The Lab section at the foot of the sidebar lists the pieces; + makes a new one.
- Selecting a piece shows it live in the preview. It reloads whenever its files change.
- **Tune** shows the piece's tuning panel (if it has one): sliders and curves for its effects, saved with Save.
- **Pick**, then click something in the preview, to point Claude at it: it goes along with your next message.
- The inspector becomes a chat with Claude (Claude Code), which changes the piece's files for you. It may edit files in public/lab on its own; anything else it asks you first (Allow, Allow in This Chat, Deny).
- **Publish Lab** publishes only the Lab's files; you can also ask Claude to publish.
- **Colors** recolors the piece's SVG files: pick a file, click shapes (Shift-click for more, **Group** for the group they're in, **Same Color** or a swatch for every shape of a color), then set the fill or stroke — none, a solid color, or a linear or radial gradient with its stops. **Save** writes the file; the preview follows.
- **Capture** saves the whole piece, top to bottom, as a PNG image (Downloads by default), just as it is in the preview — tuning, scroll effects and all. Bars pinned to the screen show only at the top. A piece that scrolls inside its own box (not the page) is captured one screen tall.
- **Prompts** exports every prompt you've sent to Claude in the Lab — date, piece, Claude's reply, what it changed and how the turn ended — as an Excel file (Downloads by default). The record is kept in the package and survives Clear Conversation.
- To show a piece on a page, add an Interactive section to the page and type the piece's name.

The chat needs Claude Code installed and signed in (see assistant).

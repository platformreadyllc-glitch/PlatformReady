#pragma once

enum class Button { WHITE, RED, BLUE, YELLOW, CLOCK };
enum class ButtonEvent { NONE, PRESSED };

// isChief enables the CLOCK button; side remotes leave it disabled.
void buttonsInit(bool isChief);

// Returns PRESSED once per physical press (debounced), NONE otherwise.
ButtonEvent buttonRead(Button b);

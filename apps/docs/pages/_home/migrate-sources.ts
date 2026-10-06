// The migration sources `blume migrate` handles: each brand's mark, name, and
// what the agent does for it. Shared by the homepage's Migrate picker and the
// /compare pages.

/**
 * The one-liner that migrates a site from `source`: the CLI names the source
 * and opens Codex on the `blume-migrate` skill bundled in the package
 * (`--claude` for Claude Code, shown beside the command).
 */
export const migrateCommand = (source: string): string =>
  `npx blume migrate ${source} --codex`;

// Brand marks, each a full <svg> so it can be injected via set:html (and copied
// into the trigger by the client script). Monochrome marks use currentColor so
// they track the theme; brand-colored marks stay fixed.
export const logos = {
  docsify:
    '<svg class="size-full" viewBox="0 0 122 94" xmlns="http://www.w3.org/2000/svg"><defs><path id="blume-docsify-body" d="M144.453286,104 C177.038086,104 203.453286,77.5848002 203.453286,45 C203.453286,12.4151998 177.038086,-14 144.453286,-14 C111.868486,-14 114.603207,13.6754846 114.603207,46.2602848 C114.603207,78.845085 111.868486,104 144.453286,104 Z"/><filter id="blume-docsify-shadow" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox"><feOffset dx="7" dy="-10" in="SourceAlpha" result="shadowOffsetInner1"/><feComposite in="shadowOffsetInner1" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowInnerInner1"/><feColorMatrix values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.1 0" type="matrix" in="shadowInnerInner1"/></filter></defs><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><g transform="translate(-98 2)"><g transform="translate(159 45) rotate(-90) translate(-159 -45)"><use fill="#2ECE53" fill-rule="evenodd" href="#blume-docsify-body"/><use fill="black" fill-opacity="1" filter="url(#blume-docsify-shadow)" href="#blume-docsify-body"/><use stroke="#0E1320" stroke-width="4" href="#blume-docsify-body"/></g><circle fill="#000000" cx="139" cy="38" r="7"/><circle fill="#000000" cx="183" cy="38" r="7"/><g transform="translate(112 10)" fill="#FFFFFF"><circle cx="2" cy="28" r="2"/><path d="M12.2551528,-1.65016666 C12.1154537,-2.17684986 12.4455583,-2.60381096 13.011574,-2.60381096 L14.9928363,-2.60381096 C15.5502953,-2.60381096 16.1214654,-2.16566487 16.2594657,-1.64268776 C16.2594657,-1.64268776 17.4280152,2.48668594 17.9030739,6.45786647 C18.3781327,10.429047 18.3171359,10.4652901 18.3171359,12.1782569 C18.3171359,16.9413523 16.2076398,26.4389164 16.2076398,26.4389164 C16.0941814,26.9676035 15.558852,27.396189 14.9928363,27.396189 L13.011574,27.396189 C12.454115,27.396189 12.1166642,26.9691757 12.2568366,26.4301177 C12.2568366,26.4301177 13.4260575,22.2288768 13.9640759,17.9859148 C14.5020943,13.7429529 14.309594,15.2982629 14.5626609,12.3723978 C14.9355337,8.06138047 12.2551528,-1.65016666 12.2551528,-1.65016666 Z" transform="translate(15.271433, 12.396189) scale(-1, 1) rotate(-48.000000) translate(-15.271433, -12.396189) "/></g><path d="M159.5,78.3050108 C169.164983,78.3050108 177,70.4699939 177,60.8050108 C177,51.1400277 169.688728,56.4616841 160.023745,56.4616841 C150.358762,56.4616841 142,51.1400277 142,60.8050108 C142,70.4699939 149.835017,78.3050108 159.5,78.3050108 Z" fill="#000000"/></g></g></svg>',
  docusaurus:
    '<svg class="size-full" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><g fill="#3ECC5F"><path d="M23 163c-7.4 0-14-4-17.3-10A20 20 0 003 163c0 11 9 20 20 20h20v-20H23zm141 20h9v-4h-8z"/><path d="M183 53V43c0-11-9-20-20-20H73c-4-8-6-8-10 0-4-8-6-8-10 0-4-8-6-8-10 0-7-9-9-5-10.3 2.3-9-3-10.3-1.7-7.3 7.3-9 2-10 3-2.4 10.4-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10-8 4-8 6 0 10 0 11 9 20 20 20h120c11 0 20-9 20-20"/></g><path fill="#FFF" d="M183 83l-70-4.3c-13.3-1.5-13.3-19.8 0-21.3l70-4.4"/><use href="#docusaurus-h" x="60"/><use href="#docusaurus-f" x="50"/><path d="M103 183h60c11 0 20-9 20-20V93h-60c-11 0-20 9-20 20v70z" fill="#FFFF50"/><g fill="none" stroke="#000" stroke-width="2" stroke-linecap="round"><path d="M63 53a1 1 0 10-20 0" stroke-width="5"/><path d="M183 62.6c-5 0-5 10-10 10.7-5 0-5-10-10-10s-5 9-10 9-5-8.5-10-8.5-5 8-10 8-5-7.25-10-7.25-5 6.5-10 6.5" stroke-linecap="butt"/><path d="M168 113h-50m50 10h-50m50 10h-50m50 10h-50m50 10h-50m50 10h-50"/></g><circle cx="143" cy="39.3" r="2.5"/><circle cx="163" cy="38" r="2.5"/><circle cx="113" cy="71" r="1"/><path d="M83 123h40v-20H83zm0 60h40v-40H83z" fill="#3ECC5F"/><g id="docusaurus-h" fill="#44D860"><circle cx="123" cy="113" r="10"/><circle cx="128" cy="104.3" r="2.4"/><circle cx="131.7" cy="108" r="2.4"/><circle cx="133" cy="113" r="2.4"/><circle cx="131.7" cy="118" r="2.4"/><circle cx="128" cy="121.7" r="2.4"/></g><g id="docusaurus-f" fill="#44D860"><circle cx="123" cy="163" r="20"/><circle cx="113" cy="145.7" r="5"/><circle cx="123" cy="143" r="5"/><circle cx="133" cy="145.7" r="5"/><circle cx="140.3" cy="153" r="5"/><circle cx="143" cy="163" r="5"/></g></svg>',
  fern: '<svg class="size-full" viewBox="0 -3.2 486.4 486.4" xmlns="http://www.w3.org/2000/svg"><path fill="#51C233" d="M437.327 234.854C405.742 208.151 358.16 197.446 315.988 228.619C314.047 230.031 311.636 227.619 313.106 225.737C323.105 212.856 334.692 198.976 344.044 185.036C353.572 170.744 367.806 160.51 384.216 155.51C471.558 129.043 445.326 0 445.326 0C445.326 0 310.401 8.70482 327.046 125.102C329.81 144.571 324.634 164.392 312.459 179.86C297.52 198.74 280.169 216.797 267.582 229.854C264.936 232.56 260.466 229.972 261.524 226.325C273.699 185.33 282.581 121.926 240.409 81.0489L181.063 31.7608L169.653 46.8178C135.716 91.577 145.656 154.687 190.474 188.565C216.177 207.975 227.822 229.09 225.999 252.263C224.882 266.144 218.588 279.142 209.178 289.435C191.474 308.845 174.946 329.666 162.183 353.78C160.419 357.133 155.302 355.839 155.478 352.016C157.301 312.197 153.478 222.443 86.4274 190.388L11.3775 161.392L5.55465 178.743C-13.3255 234.736 17.5532 294.552 73.4878 313.55C122.129 330.077 139.48 361.426 127.775 408.421C127.246 410.126 118.776 458.532 119.953 480H173.888C175.711 446.71 210.648 424.83 240.938 438.417C249.467 442.24 258.231 447.71 267.229 454.768C315.459 492.763 386.509 483.764 424.446 435.476L435.268 421.713L367.041 372.719C320.223 335.9 257.76 352.545 211.53 384.071C207.648 386.717 202.708 382.483 204.884 378.248C260.76 268.614 333.398 268.849 361.865 293.199C396.391 322.725 448.678 317.432 477.969 282.789L486.38 272.849L437.268 234.854H437.327Z"/></svg>',
  fumadocs:
    '<svg class="size-full" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="blume-fuma" gradientTransform="rotate(45)"><stop offset="45%" stop-color="var(--blume-background)"/><stop offset="100%" stop-color="#dd7627"/></linearGradient></defs><circle cx="90" cy="90" r="87" fill="url(#blume-fuma)" stroke="#dd7627" stroke-width="6"/></svg>',
  gitbook:
    '<svg class="size-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M12.513 1.097c-.645 0-1.233.34-2.407 1.017L3.675 5.82A7.233 7.233 0 0 0 0 12.063v.236a7.233 7.233 0 0 0 3.667 6.238L7.69 20.86c2.354 1.36 3.531 2.042 4.824 2.042 1.292.001 2.47-.678 4.825-2.038l4.251-2.453c1.177-.68 1.764-1.02 2.087-1.579.323-.56.324-1.24.323-2.6v-2.63a1.04 1.04 0 0 0-1.558-.903l-8.728 5.024c-.587.337-.88.507-1.201.507-.323 0-.616-.168-1.204-.506l-5.904-3.393c-.297-.171-.446-.256-.565-.271a.603.603 0 0 0-.634.368c-.045.111-.045.282-.043.625.002.252 0 .378.025.494.053.259.189.493.387.667.089.077.198.14.416.266l6.315 3.65c.589.34.884.51 1.207.51.324 0 .617-.17 1.206-.509l7.74-4.469c.202-.116.302-.172.377-.13.075.044.075.16.075.392v1.193c0 .34.001.51-.08.649-.08.14-.227.224-.522.394l-6.382 3.685c-1.178.68-1.767 1.02-2.413 1.02-.646 0-1.236-.34-2.412-1.022l-5.97-3.452-.043-.025a4.106 4.106 0 0 1-2.031-3.52V11.7c0-.801.427-1.541 1.12-1.944a1.979 1.979 0 0 1 1.982-.001l4.946 2.858c1.174.679 1.762 1.019 2.407 1.02.645 0 1.233-.34 2.41-1.017l7.482-4.306a1.091 1.091 0 0 0 0-1.891L14.92 2.11c-1.175-.675-1.762-1.013-2.406-1.013Z"/></svg>',
  mintlify:
    '<svg class="size-full" viewBox="-2.7 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="#18E299" d="M18.4725 9.60528V3.91396C18.4725 3.30323 17.977 2.81641 17.3754 2.81641H11.6867C10.7931 2.81641 9.90842 2.99342 9.08564 3.32977C8.26285 3.67497 7.51085 4.17064 6.88271 4.80793L6.83847 4.85219C6.00684 5.69305 5.41408 6.73749 5.11328 7.88815C5.65296 7.74653 6.2103 7.67572 6.76767 7.66687C8.25399 7.64916 9.71378 8.12713 10.8993 9.02111C11.9698 9.81771 12.7837 10.9153 13.2261 12.181C13.6861 13.4644 13.7392 14.8629 13.3942 16.1817C14.5354 15.8808 15.5883 15.2878 16.4288 14.4558L16.473 14.4115C17.1011 13.7831 17.6054 13.0307 17.9504 12.2075C18.2955 11.3844 18.4636 10.4993 18.4636 9.60528H18.4725Z"/><path fill="#0C8C5E" d="M4.9434 9.50941C4.95221 7.76347 5.64849 6.08807 6.87361 4.83594L2.14058 9.57113C2.12296 9.58876 2.10532 9.59758 2.08769 9.61522C0.933084 10.7615 0.23681 12.2959 0.122231 13.9183C0.0164654 15.435 0.413078 16.934 1.2592 18.1862C1.33991 18.3056 1.5589 18.3449 1.68229 18.2303L4.58202 15.338C5.48985 14.4298 5.7719 13.0806 5.34002 11.8726C5.06679 11.1231 4.93459 10.3207 4.9434 9.50941Z"/><path fill="#0C8C5E" d="M16.4445 14.4121C15.5367 15.3027 14.3997 15.92 13.1658 16.1933C11.923 16.4667 10.6362 16.3873 9.43757 15.9641C9.43757 15.9641 9.42874 15.9641 9.41992 15.9641C8.21243 15.532 6.86394 15.8141 5.95612 16.7136L3.05634 19.6058C2.93295 19.7293 2.95057 19.9321 3.10041 20.0291C4.35197 20.8668 5.85035 21.2724 7.36632 21.1666C8.98806 21.052 10.5128 20.3553 11.6674 19.2002L11.7115 19.1561L16.4445 14.4209V14.4121Z"/></svg>',
  mkdocs:
    '<svg class="size-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#526CFE" d="m17.029 18.772.777 1.166-5.417 2.709L0 16.451V4.063l5.417-2.709 5.298 7.948 7.867-5.24L24 1.354V16.84l-5.417 2.709zm2.023-13.827v13.253l3.949-1.975V2.97zM5.076 2.642 1.458 4.45 12.73 21.358l3.618-1.809z"/></svg>',
  nextra:
    '<svg class="size-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M22.68 21.031c-4.98-4.98-4.98-13.083 0-18.063l.978-.978c.22-.22.342-.513.342-.825 0-.311-.122-.604-.342-.824-.44-.441-1.207-.44-1.648 0l-.979.978c-4.98 4.98-13.084 4.98-18.063 0L1.99.34a1.17 1.17 0 0 0-1.649 0 1.168 1.168 0 0 0 0 1.649l.978.978c4.98 4.98 4.98 13.083 0 18.063l-.977.978c-.221.22-.342.513-.342.825 0 .31.121.604.341.824.442.443 1.21.441 1.65 0l.977-.977c4.98-4.983 13.083-4.98 18.064 0l.978.977c.22.22.513.342.824.342.312 0 .605-.122.824-.342.22-.22.342-.512.342-.824 0-.313-.122-.605-.342-.825l-.977-.978z"/></svg>',
  readme:
    '<svg class="size-full" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path fill="#018EF5" d="M22.0113 3.269h-5.8219a4.2894 4.2894 0 0 0-4.1854 3.3452A4.2894 4.2894 0 0 0 7.8186 3.269h-5.818A2.0007 2.0007 0 0 0 0 5.2697v10.2434a2.0007 2.0007 0 0 0 2.0007 2.0007h3.7372c4.2574 0 5.5299 1.0244 6.138 3.133a.112.112 0 0 0 .1121.084h.024a.112.112 0 0 0 .112-.084c.6122-2.1086 1.8847-3.133 6.138-3.133h3.7373A2.0007 2.0007 0 0 0 24 15.5131V5.2697a2.0007 2.0007 0 0 0-1.9887-2.0006Zm-11.928 11.0557a.144.144 0 0 1-.144.144H3.2571a.144.144 0 0 1-.144-.144v-.9523a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144zm0-2.5368a.144.144 0 0 1-.144.144H3.2571a.144.144 0 0 1-.144-.144v-.9523a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144zm0-2.5368a.144.144 0 0 1-.144.144H3.2571a.144.144 0 0 1-.144-.144v-.9524a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144zm10.8037 5.0696a.144.144 0 0 1-.144.144h-6.6823a.144.144 0 0 1-.144-.144v-.9523a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144zm0-2.5368a.144.144 0 0 1-.144.144h-6.6823a.144.144 0 0 1-.144-.144v-.9523a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144zm0-2.5368a.144.144 0 0 1-.144.144h-6.6823a.144.144 0 0 1-.144-.144v-.9484a.144.144 0 0 1 .144-.144h6.6822a.144.144 0 0 1 .144.144v.9524z"/></svg>',
  redocly:
    '<svg class="size-full" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.625 6.19973C14.625 8.69176 12.6173 10.712 10.1406 10.712H2.8125V10.2717C5.04753 10.2717 6.85938 8.44864 6.85938 6.19973C6.85938 3.95082 5.04753 2.12772 2.8125 2.12772V1.6875H10.1406C12.6173 1.6875 14.625 3.70769 14.625 6.19973Z"/><path fill="currentColor" d="M14.625 16.875C14.625 14.383 12.6173 12.3628 10.1406 12.3628H2.8125V12.803C5.04753 12.803 6.85938 14.6261 6.85938 16.875H14.625Z"/></svg>',
  starlight:
    '<svg class="size-full" viewBox="0 0 25 26" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="blume-starlight" x1="2.5" x2="21.61" y1="2.65" y2="25.4" gradientUnits="userSpaceOnUse"><stop stop-color="var(--starlight-gold-1, #FBD57F)"/><stop offset="1" stop-color="var(--starlight-gold-2, #D17F0D)"/></linearGradient></defs><path fill="url(#blume-starlight)" fill-rule="evenodd" d="M15.22 7.77 12.06.94 8.91 7.77l-.15.29L7 6.3a1.18 1.18 0 1 0-1.68 1.68l1.75 1.74-.2.1-.04.02L0 13l6.83 3.16.24.11-1.75 1.76A1.18 1.18 0 1 0 7 19.7l1.76-1.76.15.3 3.15 6.82 3.16-6.83.12-.24 1.71 1.71a1.18 1.18 0 1 0 1.68-1.67L17 16.3l.29-.15L24.13 13 17.3 9.84 17 9.7l1.73-1.73a1.18 1.18 0 1 0-1.68-1.67L15.35 8a4.15 4.15 0 0 1-.12-.21l-.01-.03Zm-3.17.36-.42.9a7.27 7.27 0 0 1-3.55 3.55l-.9.42.9.42a7.27 7.27 0 0 1 3.55 3.55l.42.9.42-.9a7.27 7.27 0 0 1 3.55-3.55l.9-.42-.9-.42a7.27 7.27 0 0 1-3.55-3.55l-.42-.9Z" clip-rule="evenodd"/><path fill="url(#blume-starlight)" d="M22.27 4.43a1.18 1.18 0 1 0-1.67-1.68l-.57.57a1.18 1.18 0 0 0 1.68 1.67l.56-.56ZM4.2 5.18c-.46.46-1.2.46-1.67 0l-.56-.56a1.18 1.18 0 0 1 1.67-1.68l.57.57c.46.46.46 1.2 0 1.67Zm0 15.64a1.18 1.18 0 0 0-1.67 0l-.56.56a1.18 1.18 0 0 0 1.67 1.68l.57-.57c.46-.46.46-1.2 0-1.67Zm18.07.75a1.18 1.18 0 0 1-1.67 1.68l-.57-.57a1.19 1.19 0 0 1 1.68-1.67l.56.56Z"/></svg>',
  vitepress:
    '<svg class="size-full" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="url(#blume-vitepress-a)" d="M5.03628 7.87818C4.75336 5.83955 6.15592 3.95466 8.16899 3.66815L33.6838 0.0367403C35.6969 -0.24977 37.5581 1.1706 37.841 3.20923L42.9637 40.1218C43.2466 42.1604 41.8441 44.0453 39.831 44.3319L14.3162 47.9633C12.3031 48.2498 10.4419 46.8294 10.159 44.7908L5.03628 7.87818Z"/><path fill="white" d="M6.85877 7.6188C6.71731 6.59948 7.41859 5.65703 8.42512 5.51378L33.9399 1.88237C34.9465 1.73911 35.8771 2.4493 36.0186 3.46861L41.1412 40.3812C41.2827 41.4005 40.5814 42.343 39.5749 42.4862L14.0601 46.1176C13.0535 46.2609 12.1229 45.5507 11.9814 44.5314L6.85877 7.6188Z"/><path fill="url(#blume-vitepress-b)" d="M33.1857 14.9195L25.8505 34.1576C25.6991 34.5547 25.1763 34.63 24.9177 34.2919L12.3343 17.8339C12.0526 17.4655 12.3217 16.9339 12.7806 16.9524L22.9053 17.3607C22.9698 17.3633 23.0344 17.3541 23.0956 17.3337L32.5088 14.1992C32.9431 14.0546 33.3503 14.4878 33.1857 14.9195Z"/><path fill="url(#blume-vitepress-c)" d="M27.0251 12.5756L19.9352 15.0427C19.8187 15.0832 19.7444 15.1986 19.7546 15.3231L20.3916 23.063C20.4066 23.2453 20.5904 23.3628 20.7588 23.2977L22.7226 22.5392C22.9064 22.4682 23.1021 22.6138 23.0905 22.8128L22.9102 25.8903C22.8982 26.0974 23.1093 26.2436 23.295 26.1567L24.4948 25.5953C24.6808 25.5084 24.892 25.6549 24.8795 25.8624L24.5855 30.6979C24.5671 31.0004 24.9759 31.1067 25.1013 30.8321L25.185 30.6487L29.4298 17.8014C29.5008 17.5863 29.2968 17.3809 29.0847 17.454L27.0519 18.1547C26.8609 18.2205 26.6675 18.0586 26.6954 17.8561L27.3823 12.8739C27.4103 12.6712 27.2163 12.5091 27.0251 12.5756Z"/><defs><linearGradient id="blume-vitepress-a" x1="6.48163" y1="1.9759" x2="39.05" y2="48.2064" gradientUnits="userSpaceOnUse"><stop stop-color="#49C7FF"/><stop offset="1" stop-color="#BD36FF"/></linearGradient><linearGradient id="blume-vitepress-b" x1="11.8848" y1="16.4266" x2="26.7246" y2="31.4177" gradientUnits="userSpaceOnUse"><stop stop-color="#41D1FF"/><stop offset="1" stop-color="#BD34FE"/></linearGradient><linearGradient id="blume-vitepress-c" x1="21.8138" y1="13.7046" x2="26.2464" y2="28.8069" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEA83"/><stop offset="0.0833333" stop-color="#FFDD35"/><stop offset="1" stop-color="#FFA800"/></linearGradient></defs></svg>',
  vuepress:
    '<svg class="size-full" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M2.73587 7.90886L19.3984 5.43536C19.8439 5.36933 20.3115 5.63888 20.4443 6.03926L27.3378 26.8118C27.5068 27.3216 27.2442 27.8237 26.7485 27.9312L8.08892 31.9766C7.53676 32.0964 6.99003 31.7433 6.87004 31.1904L2.01592 8.81459C1.92304 8.38637 2.24605 7.98155 2.73587 7.90886Z" fill="url(#blume-vuepress-a)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M2.8401 7.68541L19.5027 5.21191C19.9481 5.14588 20.4158 5.41543 20.5486 5.81581L27.442 26.5884C27.6113 27.0982 27.3484 27.6003 26.8527 27.7077L8.19315 31.7532C7.64099 31.8729 7.09425 31.5199 6.97426 30.967L2.11991 8.59139C2.02702 8.16292 2.35003 7.75834 2.8401 7.68541Z" fill="url(#blume-vuepress-b)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M4.4202 5.19932L20.9615 2.77387C21.405 2.70882 21.8749 2.98059 22.0124 3.38196L29.0032 23.7904C29.1712 24.2809 28.9172 24.7624 28.434 24.8636L10.3229 28.6681C9.78926 28.7802 9.24967 28.4422 9.11958 27.9152L3.73179 6.09987C3.62633 5.67313 3.93531 5.27053 4.4202 5.19932Z" fill="url(#blume-vuepress-c)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M4.52418 4.97612L21.0655 2.55066C21.509 2.48562 21.9789 2.75738 22.1163 3.15875L29.1071 23.5672C29.2752 24.0577 29.0212 24.5392 28.538 24.6404L10.4269 28.4449C9.89324 28.557 9.35364 28.219 9.22355 27.692L3.83601 5.87667C3.73056 5.44968 4.03928 5.04708 4.52418 4.97612Z" fill="url(#blume-vuepress-d)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M6.19741 2.58045L22.5968 0.23236C23.0371 0.169284 23.5062 0.438834 23.6462 0.83552L30.7136 20.8674C30.8824 21.3459 30.6345 21.8138 30.158 21.9111L12.3295 25.5545C11.805 25.6617 11.2693 25.3318 11.1348 24.8193L5.52698 3.46548C5.41611 3.04489 5.71719 2.64919 6.19741 2.58045Z" fill="url(#blume-vuepress-e)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M6.30139 2.35699L22.7008 0.00915408C23.1411 -0.0539215 23.6102 0.215628 23.7502 0.612315L30.8176 20.6442C30.9864 21.1227 30.7385 21.5906 30.262 21.6879L12.4335 25.3313C11.909 25.4385 11.3733 25.1086 11.2388 24.5961L5.63096 3.24252C5.52033 2.82168 5.82117 2.42574 6.30139 2.35699Z" fill="url(#blume-vuepress-f)"/><path fill-rule="evenodd" clip-rule="evenodd" d="M15.1566 15.5455L22.3814 14.2066C22.4842 14.1876 22.585 14.2482 22.6163 14.3478L23.829 18.2018C23.8659 18.3193 23.7925 18.443 23.6713 18.4667L16.3429 19.8935C16.2372 19.9139 16.1338 19.8501 16.1044 19.7466L14.9952 15.8044C14.9624 15.6876 15.0371 15.5676 15.1566 15.5455ZM14.5327 15.8884L15.6242 19.8627C15.709 20.1709 16.0167 20.3619 16.3304 20.301L23.7469 18.8592C24.1064 18.7892 24.3242 18.4213 24.2126 18.0727L22.9883 14.2453C22.8949 13.9535 22.6005 13.7759 22.2989 13.8296L15.0149 15.1246C14.6611 15.1877 14.4374 15.5415 14.5327 15.8884ZM15.9739 16.2122L16.7374 18.8927L17.5579 18.7059L17.1193 17.1625L18.2394 18.0397L18.7844 16.805L19.2311 18.3728L20.0272 18.2023L19.2555 15.6113L18.4106 15.7574L17.8989 16.8944L16.7941 16.0577L15.9739 16.2122ZM21.9185 16.5727L21.5095 15.1978L20.6594 15.3432L21.0906 16.7304L20.3268 16.8782L21.8963 17.9253L22.6921 16.4224L21.9185 16.5727Z" fill="#BCC0CF"/><path d="M23.8107 18.3664L23.7245 18.5462L23.6974 18.6029C23.6678 18.6473 23.621 18.6793 23.5668 18.6892L16.2392 20.1182C16.1333 20.1379 16.0298 20.0739 16.0002 19.9704L14.8915 16.0282C14.8791 15.9813 14.8816 15.9321 14.9013 15.8902C14.9038 15.8852 14.9062 15.8803 14.9087 15.8754L14.9161 15.8606L14.9999 15.6807C14.9851 15.7177 14.9826 15.7621 14.9949 15.8039L15.0245 15.9099L16.1037 19.7462C16.1333 19.8496 16.2367 19.9137 16.3427 19.894L23.6678 18.4674H23.6703C23.7344 18.4551 23.7836 18.4157 23.8107 18.3664ZM24.1187 18.6226C24.1458 18.5191 24.1434 18.4058 24.1089 18.2949L22.8843 14.4685C22.7907 14.1778 22.4975 14.0004 22.1944 14.0521L14.9112 15.3481C14.751 15.3752 14.6155 15.4639 14.5293 15.5871C14.5785 15.358 14.7633 15.1683 15.0146 15.1239L22.3004 13.8304C22.601 13.7762 22.8966 13.9536 22.9878 14.2443L24.2124 18.0732C24.2764 18.2678 24.2345 18.4723 24.1187 18.6226ZM22.6921 16.4224L22.5714 16.6491L21.815 16.7969L21.406 15.422L20.721 15.5403L20.6594 15.3432L21.5095 15.1978L21.9185 16.5727L22.6921 16.4224ZM20.928 16.7624L21.0906 16.7304L20.9871 16.9546L20.5633 17.0359L20.3268 16.8782L20.928 16.7624ZM17.8949 16.893L17.7939 17.1172L16.6901 16.2819L16.0273 16.4051L15.9731 16.2129L16.7936 16.0577L17.8949 16.893ZM20.0262 18.2013L19.866 18.2358L19.1515 15.8335L18.3089 15.9813L18.4099 15.7571L19.255 15.6118L20.0262 18.2013ZM17.2297 17.5533L17.1188 17.1615L17.0153 17.3858L17.4022 18.7409L17.5574 18.7064L17.2297 17.5533Z" fill="#A2A6B3"/><path d="M12.8933 5.37674L10.7645 5.67241L18.3335 12.7093L21.0537 4.07581L19.0431 4.43061L17.4465 9.51608L12.8933 5.37674Z" fill="url(#blume-vuepress-g)"/><path d="M12.8932 5.37674L14.8447 5.08107L16.5595 6.61854L17.21 4.72627L19.0431 4.4306L17.4465 9.51607L12.8932 5.37674Z" fill="url(#blume-vuepress-h)"/><defs><linearGradient id="blume-vuepress-a" x1="14.6945" y1="31.9997" x2="14.6945" y2="5.42521" gradientUnits="userSpaceOnUse"><stop stop-color="#1D2130"/><stop offset="1" stop-color="#3E445A"/></linearGradient><linearGradient id="blume-vuepress-b" x1="14.7986" y1="31.7764" x2="14.7986" y2="5.20194" gradientUnits="userSpaceOnUse"><stop stop-color="#262B3F"/><stop offset="1" stop-color="#656E91"/></linearGradient><linearGradient id="blume-vuepress-c" x1="16.383" y1="28.6898" x2="16.383" y2="2.76414" gradientUnits="userSpaceOnUse"><stop stop-color="#267550"/><stop offset="1" stop-color="#79B881"/></linearGradient><linearGradient id="blume-vuepress-d" x1="16.4871" y1="28.4665" x2="16.4871" y2="2.54086" gradientUnits="userSpaceOnUse"><stop stop-color="#279264"/><stop offset="1" stop-color="#A4F3AA"/></linearGradient><linearGradient id="blume-vuepress-e" x1="18.1351" y1="25.575" x2="18.1351" y2="0.223269" gradientUnits="userSpaceOnUse"><stop offset="0.59" stop-color="#CECFD0"/><stop offset="1" stop-color="#DFDFDF"/></linearGradient><linearGradient id="blume-vuepress-f" x1="18.2392" y1="25.3517" x2="18.2392" y2="-1.20886e-05" gradientUnits="userSpaceOnUse"><stop stop-color="#EAEEF0"/><stop offset="0.41" stop-color="white"/></linearGradient><linearGradient id="blume-vuepress-g" x1="13.2661" y1="-3.77058" x2="23.9637" y2="31.2197" gradientUnits="userSpaceOnUse"><stop offset="0.22" stop-color="#73CB8D"/><stop offset="0.4" stop-color="#2F9869"/></linearGradient><linearGradient id="blume-vuepress-h" x1="11.8979" y1="-6.91736" x2="28.6463" y2="41.7235" gradientUnits="userSpaceOnUse"><stop offset="0.25" stop-color="#586080"/><stop offset="0.35" stop-color="#2C3247"/></linearGradient></defs></svg>',
};

let svgInstance = 0;

/**
 * A mark's inline SVG with its ids (and every `#id` reference to them) made
 * unique to this render. The same mark can appear several times on one page —
 * the picker trigger and its option, a table header hidden on phones — and a
 * gradient referenced by a shared id resolves to the first copy, which draws
 * nothing when that copy is hidden. Call it wherever a mark is rendered.
 */
export const withUniqueIds = (svg: string): string => {
  svgInstance += 1;
  const suffix = `-${svgInstance}`;
  let out = svg;
  for (const match of svg.matchAll(/\sid="(?<id>[^"]+)"/gu)) {
    const id = match.groups?.id ?? "";
    out = out
      .replaceAll(`id="${id}"`, `id="${id}${suffix}"`)
      .replaceAll(`#${id}"`, `#${id}${suffix}"`)
      .replaceAll(`#${id})`, `#${id}${suffix})`);
  }
  return out;
};

export const sources = [
  {
    body: "The agent translates docs.json to blume.config.ts, reshapes config-driven navigation into folders and tabs, rewrites callouts to directives, inlines snippets, and maps Font Awesome icons to their Lucide equivalents.",
    id: "mintlify",
    logo: logos.mintlify,
    name: "Mintlify",
  },
  {
    body: "The agent moves your content/docs tree into place, turns every meta.json into a typed meta.ts, and rewrites Cards, Accordions, and Tabs to Blume's components — includes, frontmatter, and folder order intact.",
    id: "fumadocs",
    logo: logos.fumadocs,
    name: "Fumadocs",
  },
  {
    body: "The agent maps docusaurus.config and sidebars.js onto Blume, keeps your admonitions as directives, converts Tabs and _category_.json, and reports the swizzled-theme chrome it can't carry over.",
    id: "docusaurus",
    logo: logos.docusaurus,
    name: "Docusaurus",
  },
  {
    body: "The agent reads your starlight() config and src/content/docs collection, turns asides into directives, renames CardGrid, LinkCard, and TabItem, and maps the Starlight icon set to Lucide.",
    id: "starlight",
    logo: logos.starlight,
    name: "Starlight",
  },
  {
    body: "The agent brings your Nextra pages across as Blume MDX and turns every _meta file into a typed meta.ts — navigation order and frontmatter intact, callouts converted to directives.",
    id: "nextra",
    logo: logos.nextra,
    name: "Nextra",
  },
  {
    body: "The agent moves every page to the URL SUMMARY.md gave it, converts hints, tabs, steppers, and content refs to directives and components, turns reusable content into includes, and pins GitBook's heading anchors so old deep links still land.",
    id: "gitbook",
    logo: logos.gitbook,
    name: "GitBook",
  },
  {
    body: "The agent runs a codemod that turns admonitions, content tabs, and snippets into directives, tabs, and includes, rebuilds the mkdocs.yml nav as folders without changing a URL, and pins old heading anchors.",
    guide: "migrate-from-mkdocs-material",
    id: "mkdocs",
    logo: logos.mkdocs,
    name: "MkDocs",
  },
  {
    body: "The agent runs a bundled codemod that keeps every page at its flat ReadMe URL, turns callouts, code tabs, and ReadMe's components into Blume's, and generates your API reference from the OpenAPI files you sync, redirecting every old endpoint URL.",
    id: "readme",
    logo: logos.readme,
    name: "ReadMe",
  },
  {
    body: "The agent maps .vitepress/config onto Blume, runs a codemod that turns containers, code groups, and snippet imports into directives, CodeGroup, and includes, rebuilds sidebar groups as folders without changing a URL, redirects every .html page, and pins old heading anchors.",
    id: "vitepress",
    logo: logos.vitepress,
    name: "VitePress",
  },
  {
    body: "The agent rebuilds docs.yml navigation as folders that keep every page URL, converts callouts, code groups, and cards, exports a Fern Definition to OpenAPI with a redirect for every endpoint, and leaves SDK generation in fern/ untouched.",
    id: "fern",
    logo: logos.fern,
    name: "Fern",
  },
  {
    body: "The agent converts Markdoc tags to directives and components, rebuilds sidebars.yaml as folders and tabs, gives each OpenAPI file a native reference, and generates a redirect for every old operation URL, leaving your lint config in redocly.yaml.",
    id: "redocly",
    logo: logos.redocly,
    name: "Redocly",
  },
  {
    body: "The agent maps .vuepress/config onto Blume, renames README indexes, converts containers, badges, and code groups in every language, rebuilds sidebars as folders without changing a URL, redirects every .html page, and pins old heading anchors.",
    id: "vuepress",
    logo: logos.vuepress,
    name: "VuePress",
  },
  {
    body: "The agent runs a codemod that turns !> callouts, docsify-tabs, and ':include' links into directives, Tabs, and includes, rebuilds _sidebar.md as folders, and adds a small script so every old #/ link and ?id= anchor still lands on its page and heading.",
    id: "docsify",
    logo: logos.docsify,
    name: "Docsify",
  },
];

export type MigrateSource = (typeof sources)[number];

/** A migration source by id, for pages built around one tool. */
export const sourceById = (id: string): MigrateSource => {
  const source = sources.find((candidate) => candidate.id === id);
  if (!source) {
    throw new Error(`Unknown migration source: ${id}`);
  }
  return source;
};

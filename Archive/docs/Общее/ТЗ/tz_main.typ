#import "template.typ": template
#import "tz_cfg.typ": cfg
#show: body => template(cfg: cfg, body)
#include "tz_body.typ"
